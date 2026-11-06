"""Check simultaneous field saves against isolated, file-backed SQLite.

Run with `uv run python verify_balance_concurrency.py`. A private temporary
database is used so Django's shared in-memory test database cannot alter SQLite
locking behavior. No existing application database is opened.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
from unittest.mock import patch
import os


def main():
    with TemporaryDirectory(prefix='budget-balance-concurrency-') as temporary:
        os.environ['DATABASE_PATH'] = str(Path(temporary) / 'isolated.sqlite3')
        os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'

        import django
        django.setup()

        from django.db import connection, connections
        from django.test import override_settings
        from rest_framework.test import APIClient
        from core.models import Budget, MonthlyActualBalance
        from core.serializers import ActualBalanceFieldSerializer

        # Only these two tables participate in this endpoint.
        with connection.schema_editor() as schema:
            schema.create_model(Budget)
            schema.create_model(MonthlyActualBalance)
        budget = Budget.objects.create(name='Concurrent balance')
        barrier = Barrier(2)
        original_validate = ActualBalanceFieldSerializer.is_valid

        def synchronized_validate(serializer, *args, **kwargs):
            result = original_validate(serializer, *args, **kwargs)
            # Both requests have resolved the budget on separate connections,
            # and neither has created the monthly row when they meet here.
            assert not MonthlyActualBalance.objects.exists()
            barrier.wait(timeout=10)
            return result

        def save(field, value):
            try:
                response = APIClient().post('/api/actual-balances/set_field/', {
                    'budget': budget.pk, 'year': 2025, 'month': 4,
                    'field': field, 'value': value,
                }, format='json')
                return response.status_code, response.data, id(connections['default'].connection)
            finally:
                connections.close_all()

        try:
            with override_settings(ALLOWED_HOSTS=['testserver']):
                with patch.object(ActualBalanceFieldSerializer, 'is_valid', synchronized_validate):
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        income = pool.submit(save, 'income', '1200.00')
                        expenses = pool.submit(save, 'expenses', '700.00')
                        outcomes = [income.result(timeout=20), expenses.result(timeout=20)]
            assert all(result[0] == 200 for result in outcomes), outcomes
            assert outcomes[0][2] != outcomes[1][2], 'Requests must use separate database connections.'
            assert MonthlyActualBalance.objects.count() == 1
            balance = MonthlyActualBalance.objects.get()
            assert balance.actual_income == 1200, balance.actual_income
            assert balance.actual_expenses == 700, balance.actual_expenses
            print('PASS: simultaneous income/expense creates preserved both values in exactly one row (separate SQLite connections).')
        finally:
            connections.close_all()


if __name__ == '__main__':
    main()
