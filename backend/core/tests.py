from django.test import TestCase
from decimal import Decimal
from .models import Budget, BudgetCategory, BudgetEntry, BudgetTemplate


class BudgetModelTests(TestCase):
    """Tests for Budget model"""

    def setUp(self):
        self.budget = Budget.objects.create(
            name="Test Budget",
            year=2026,
            currency="EUR"
        )

    def test_budget_creation(self):
        """Test creating a budget"""
        self.assertEqual(self.budget.name, "Test Budget")
        self.assertEqual(self.budget.year, 2026)
        self.assertEqual(self.budget.currency, "EUR")

    def test_budget_str(self):
        """Test budget string representation"""
        self.assertEqual(str(self.budget), "Test Budget (2026)")

    def test_yearly_summary_empty(self):
        """Test yearly summary with no entries"""
        summary = self.budget.get_yearly_summary()
        self.assertEqual(summary['year'], 2026)
        self.assertEqual(summary['total_income'], Decimal('0'))
        self.assertEqual(summary['total_expenses'], Decimal('0'))
        self.assertEqual(summary['balance'], Decimal('0'))


class BudgetCategoryTests(TestCase):
    """Tests for BudgetCategory model"""

    def setUp(self):
        self.budget = Budget.objects.create(
            name="Test Budget",
            year=2026,
            currency="EUR"
        )
        self.category = BudgetCategory.objects.create(
            budget=self.budget,
            name="Salary",
            category_type="INCOME",
            order=1
        )

    def test_category_creation(self):
        """Test creating a category"""
        self.assertEqual(self.category.name, "Salary")
        self.assertEqual(self.category.category_type, "INCOME")
        self.assertEqual(self.category.order, 1)
        self.assertTrue(self.category.is_active)

    def test_category_str(self):
        """Test category string representation"""
        expected = "Test Budget - Salary (Income)"
        self.assertEqual(str(self.category), expected)


class BudgetEntryTests(TestCase):
    """Tests for BudgetEntry model"""

    def setUp(self):
        self.budget = Budget.objects.create(
            name="Test Budget",
            year=2026,
            currency="EUR"
        )
        self.income_category = BudgetCategory.objects.create(
            budget=self.budget,
            name="Salary",
            category_type="INCOME",
            order=1
        )
        self.expense_category = BudgetCategory.objects.create(
            budget=self.budget,
            name="Rent",
            category_type="FIXED_EXPENSE",
            order=2
        )

    def test_entry_creation(self):
        """Test creating an entry"""
        entry = BudgetEntry.objects.create(
            category=self.income_category,
            month=1,
            year=2026,
            planned_amount=Decimal('3000.00'),
            actual_amount=Decimal('3100.00')
        )
        self.assertEqual(entry.month, 1)
        self.assertEqual(entry.planned_amount, Decimal('3000.00'))
        self.assertEqual(entry.actual_amount, Decimal('3100.00'))

    def test_status_calculation_income_within_budget(self):
        """Test status calculation for income meeting target"""
        entry = BudgetEntry.objects.create(
            category=self.income_category,
            month=1,
            year=2026,
            planned_amount=Decimal('3000.00'),
            actual_amount=Decimal('3100.00')
        )
        self.assertEqual(entry.status, 'WITHIN_BUDGET')

    def test_status_calculation_income_warning(self):
        """Test status calculation for income at 90-100%"""
        entry = BudgetEntry.objects.create(
            category=self.income_category,
            month=1,
            year=2026,
            planned_amount=Decimal('3000.00'),
            actual_amount=Decimal('2800.00')
        )
        self.assertEqual(entry.status, 'WARNING')

    def test_status_calculation_expense_within_budget(self):
        """Test status calculation for expense under budget"""
        entry = BudgetEntry.objects.create(
            category=self.expense_category,
            month=1,
            year=2026,
            planned_amount=Decimal('1000.00'),
            actual_amount=Decimal('900.00')
        )
        self.assertEqual(entry.status, 'WITHIN_BUDGET')

    def test_status_calculation_expense_over_budget(self):
        """Test status calculation for expense over budget"""
        entry = BudgetEntry.objects.create(
            category=self.expense_category,
            month=1,
            year=2026,
            planned_amount=Decimal('1000.00'),
            actual_amount=Decimal('1100.00')
        )
        self.assertEqual(entry.status, 'OVER_BUDGET')

    def test_status_auto_update_on_save(self):
        """Test that status is automatically updated on save"""
        entry = BudgetEntry.objects.create(
            category=self.expense_category,
            month=1,
            year=2026,
            planned_amount=Decimal('1000.00'),
            actual_amount=Decimal('900.00')
        )
        self.assertEqual(entry.status, 'WITHIN_BUDGET')

        # Update actual amount
        entry.actual_amount = Decimal('1100.00')
        entry.save()
        self.assertEqual(entry.status, 'OVER_BUDGET')


class BudgetTemplateTests(TestCase):
    """Tests for BudgetTemplate model"""

    def setUp(self):
        self.template = BudgetTemplate.objects.create(
            name="Standard Template",
            categories=[
                {"name": "Salary", "category_type": "INCOME", "order": 1},
                {"name": "Rent", "category_type": "FIXED_EXPENSE", "order": 2},
            ]
        )

    def test_template_creation(self):
        """Test creating a template"""
        self.assertEqual(self.template.name, "Standard Template")
        self.assertEqual(len(self.template.categories), 2)

    def test_apply_template(self):
        """Test applying template to a budget"""
        budget = Budget.objects.create(
            name="Test Budget",
            year=2026,
            currency="EUR"
        )

        categories = self.template.apply_to_budget(budget)
        self.assertEqual(len(categories), 2)
        self.assertEqual(categories[0].name, "Salary")
        self.assertEqual(categories[1].name, "Rent")


class BudgetCalculationTests(TestCase):
    """Tests for budget calculations"""

    def setUp(self):
        self.budget = Budget.objects.create(
            name="Test Budget",
            year=2026,
            currency="EUR"
        )

        self.income_cat = BudgetCategory.objects.create(
            budget=self.budget,
            name="Salary",
            category_type="INCOME",
            order=1
        )

        self.expense_cat = BudgetCategory.objects.create(
            budget=self.budget,
            name="Rent",
            category_type="FIXED_EXPENSE",
            order=2
        )

        # Create entries for January
        BudgetEntry.objects.create(
            category=self.income_cat,
            month=1,
            year=2026,
            planned_amount=Decimal('3000.00'),
            actual_amount=Decimal('3000.00')
        )

        BudgetEntry.objects.create(
            category=self.expense_cat,
            month=1,
            year=2026,
            planned_amount=Decimal('1000.00'),
            actual_amount=Decimal('1000.00')
        )

    def test_monthly_summary(self):
        """Test monthly summary calculation"""
        summary = self.budget.get_monthly_summary(1)
        self.assertEqual(summary['total_income'], Decimal('3000.00'))
        self.assertEqual(summary['total_expenses'], Decimal('1000.00'))
        self.assertEqual(summary['balance'], Decimal('2000.00'))

    def test_category_monthly_total(self):
        """Test category monthly total calculation"""
        total = self.income_cat.get_monthly_total(1)
        self.assertEqual(total['total_planned'], Decimal('3000.00'))
        self.assertEqual(total['total_actual'], Decimal('3000.00'))
