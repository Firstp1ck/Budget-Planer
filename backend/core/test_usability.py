from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from io import BytesIO
from openpyxl import load_workbook

from django.test import TestCase
from rest_framework.test import APIClient

from .models import Budget, BudgetCategory, BudgetEntry, MonthlyActualBalance
from .utils import export_budget_to_excel


class SafeBudgetEditingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.budget = Budget.objects.create(name='Safety checks')
        self.category = BudgetCategory.objects.create(budget=self.budget, name='Salary', category_type='INCOME')

    def test_bulk_plan_is_year_scoped_and_preserves_zero_actual_and_notes(self):
        historic = BudgetEntry.objects.create(category=self.category, year=2024, month=1, planned_amount=25)
        recorded = BudgetEntry.objects.create(category=self.category, year=2025, month=1,
                                             planned_amount=100, actual_amount=0, notes='Keep receipt')
        response = self.client.post(f'/api/categories/{self.category.pk}/plan_entries/', {
            'year': 2025, 'entries': [{'month': 1, 'planned_amount': '250.00'}, {'month': 2, 'planned_amount': '0.00'}]
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        historic.refresh_from_db()
        recorded.refresh_from_db()
        self.assertEqual(historic.planned_amount, 25)
        self.assertEqual(recorded.planned_amount, 250)
        self.assertEqual(recorded.actual_amount, 0)
        self.assertEqual(recorded.notes, 'Keep receipt')
        self.assertTrue(BudgetEntry.objects.filter(category=self.category, year=2025, month=2, planned_amount=0).exists())

    def test_invalid_bulk_payload_writes_nothing(self):
        for entries in ([{'month': 1, 'planned_amount': '10'}, {'month': 13, 'planned_amount': '20'}],
                        [{'month': 1, 'planned_amount': '10'}, {'month': 1, 'planned_amount': '20'}],
                        [{'month': 1, 'planned_amount': 'NaN'}]):
            response = self.client.post(f'/api/categories/{self.category.pk}/plan_entries/',
                                        {'year': 2025, 'entries': entries}, format='json')
            self.assertEqual(response.status_code, 400)
            self.assertFalse(BudgetEntry.objects.exists())

    def test_bulk_late_failure_rolls_back_earlier_writes(self):
        original_save = BudgetEntry.save

        def fail_second(entry, *args, **kwargs):
            if entry.month == 2:
                raise RuntimeError('Simulated storage failure')
            return original_save(entry, *args, **kwargs)

        with patch.object(BudgetEntry, 'save', fail_second):
            response = self.client.post(f'/api/categories/{self.category.pk}/plan_entries/', {
                    'year': 2025, 'entries': [{'month': 1, 'planned_amount': '10'}, {'month': 2, 'planned_amount': '20'}]
                }, format='json')
            self.assertEqual(response.status_code, 500)
        self.assertFalse(BudgetEntry.objects.exists())

    def test_bulk_does_not_change_global_category_configuration(self):
        self.category.input_mode = 'CUSTOM'
        self.category.yearly_amount = 100
        self.category.custom_months = 4
        self.category.save()
        response = self.client.post(f'/api/categories/{self.category.pk}/plan_entries/', {
            'year': 2025, 'entries': [{'month': 1, 'planned_amount': '250'}]
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.category.refresh_from_db()
        self.assertEqual(self.category.yearly_amount, 100)
        self.assertFalse(BudgetEntry.objects.exists())

    def test_independent_balance_fields_share_one_row_and_preserve_sibling(self):
        # Simulate two editors opened before either monthly balance exists.
        for field, value in [('income', '1200.00'), ('expenses', '700.00'), ('income', '0.00')]:
            response = self.client.post('/api/actual-balances/set_field/', {
                'budget': self.budget.pk, 'year': 2025, 'month': 4, 'field': field, 'value': value
            }, format='json')
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MonthlyActualBalance.objects.count(), 1)
        balance = MonthlyActualBalance.objects.get()
        self.assertEqual(balance.actual_income, 0)
        self.assertEqual(balance.actual_expenses, 700)

    def test_zero_actual_is_different_from_missing(self):
        entry = BudgetEntry.objects.create(category=self.category, year=2025, month=1,
                                           planned_amount=1000, actual_amount=0)
        self.assertEqual(entry.status, 'OVER_BUDGET')
        self.assertEqual(self.budget.get_monthly_summary(1, 2025)['total_income'], Decimal('0'))
        entry.actual_amount = None
        entry.save()
        self.assertEqual(entry.status, 'WITHIN_BUDGET')
        self.assertEqual(self.budget.get_monthly_summary(1, 2025)['total_income'], Decimal('1000'))

    def test_excel_export_uses_a_real_year_and_keeps_zero_actual(self):
        BudgetEntry.objects.create(category=self.category, year=2025, month=1,
                                   planned_amount=1000, actual_amount=0)
        response = export_budget_to_excel(self.budget)
        sheet = load_workbook(BytesIO(response.content)).active
        self.assertEqual(sheet.title, 'Budget 2025')
        salary_row = next(row for row in sheet.iter_rows() if row[0].value == 'Salary')
        self.assertEqual(salary_row[1].value, 0)
        self.assertEqual(salary_row[-1].value, 0)


class BudgetImportIntegrityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {
            'budget': {'name': 'Imported plan', 'currency': 'CHF'},
            'categories': [
                {'id': 1, 'name': 'Salary', 'category_type': 'INCOME', 'order': 0, 'is_active': True,
                 'input_mode': 'MONTHLY', 'custom_months': None, 'custom_start_month': None, 'yearly_amount': None},
                {'id': 2, 'name': 'Insurance', 'category_type': 'FIXED_EXPENSE', 'order': 1, 'is_active': False,
                 'input_mode': 'CUSTOM', 'custom_months': 4, 'custom_start_month': 2, 'yearly_amount': '125.50'},
            ],
            'entries': [
                {'category': 1, 'month': 1, 'year': 2024, 'planned_amount': '1000.00', 'actual_amount': '0.00', 'notes': 'No payment'},
                {'category': 2, 'month': 2, 'year': 2025, 'planned_amount': '125.50', 'actual_amount': None, 'notes': 'Keep this'},
            ],
            'tax_entries': [{'name': 'Example', 'percentage': '3.50', 'order': 0, 'is_active': False}],
            'salary_reductions': [{'name': 'Fixed', 'reduction_type': 'FIXED', 'value': '20.00', 'order': 0, 'is_active': False}],
            'actual_balances': [{'month': 1, 'year': 2024, 'actual_income': '0.00', 'actual_expenses': '50.00'}],
        }

    def do_import(self, payload):
        return self.client.post('/api/budgets/import/', payload, format='json')

    def test_full_export_round_trip_preserves_history_and_inactive_settings(self):
        response = self.do_import(self.payload)
        self.assertEqual(response.status_code, 201, response.data)
        exported = self.client.get(f"/api/budgets/{response.data['id']}/export_json/").data
        self.assertEqual(len(exported['categories']), 2)
        self.assertEqual(exported['entries'][0]['actual_amount'], '0.00')
        self.assertIsNone(exported['entries'][1]['actual_amount'])
        self.assertEqual(exported['entries'][1]['notes'], 'Keep this')
        self.assertEqual(exported['categories'][1]['custom_start_month'], 2)
        self.assertEqual(exported['categories'][1]['yearly_amount'], '125.50')
        self.assertFalse(exported['categories'][1]['is_active'])
        self.assertFalse(exported['tax_entries'][0]['is_active'])
        self.assertFalse(exported['salary_reductions'][0]['is_active'])
        self.assertEqual(exported['actual_balances'][0]['actual_income'], '0.00')
        exported['budget']['name'] = 'Round trip'
        again = self.do_import(exported)
        self.assertEqual(again.status_code, 201, again.data)
        restored = self.client.get(f"/api/budgets/{again.data['id']}/export_json/").data
        # Compare semantic data, excluding new database IDs and timestamps.
        for field in ('categories', 'tax_entries', 'salary_reductions', 'actual_balances'):
            strip = lambda rows: [{k: v for k, v in row.items() if k not in ('id', 'budget', 'created_at', 'updated_at')} for row in rows]
            self.assertEqual(strip(restored[field]), strip(exported[field]))
        strip_entries = lambda rows: [{k: v for k, v in row.items() if k not in ('id', 'category')} for row in rows]
        self.assertEqual(strip_entries(restored['entries']), strip_entries(exported['entries']))

    def test_bad_shapes_references_and_duplicates_do_not_create_budget(self):
        variants = [None, [], {'budget': self.payload['budget'], 'categories': None}]
        for field in ('categories', 'entries', 'tax_entries', 'salary_reductions', 'actual_balances'):
            variant = deepcopy(self.payload)
            variant[field] = [None]
            variants.append(variant)
        for change in ('duplicate_id', 'unknown_reference', 'duplicate_entry', 'duplicate_balance'):
            variant = deepcopy(self.payload)
            if change == 'duplicate_id':
                variant['categories'][1]['id'] = 1
            elif change == 'unknown_reference':
                variant['entries'][0]['category'] = 99
            elif change == 'duplicate_entry':
                variant['entries'].append(deepcopy(variant['entries'][0]))
            else:
                variant['actual_balances'].append(deepcopy(variant['actual_balances'][0]))
            variants.append(variant)
        for payload in variants:
            with self.subTest(payload=payload):
                response = self.do_import(payload)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertFalse(Budget.objects.exists())

    def test_late_validation_failure_rolls_back_every_record(self):
        self.payload['actual_balances'][0]['actual_expenses'] = 'not a number'
        response = self.do_import(self.payload)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Budget.objects.exists())
        self.assertFalse(BudgetCategory.objects.exists())
        self.assertFalse(BudgetEntry.objects.exists())
