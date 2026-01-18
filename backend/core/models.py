from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal


class Budget(models.Model):
    """Main budget model representing a yearly budget plan"""
    name = models.CharField(max_length=200)
    year = models.IntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(2100)]
    )
    currency = models.CharField(max_length=3, default='CHF')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', 'name']
        unique_together = ['name', 'year']

    def __str__(self):
        return f"{self.name} ({self.year})"

    def get_monthly_summary(self, month, year=None):
        """Calculate income, expenses, and balance for a specific month"""
        if year is None:
            year = self.year

        entries = BudgetEntry.objects.filter(
            category__budget=self,
            month=month,
            year=year
        ).select_related('category')

        total_income = Decimal('0')
        total_expenses = Decimal('0')

        for entry in entries:
            amount = Decimal(entry.actual_amount or entry.planned_amount)
            if entry.category.category_type == 'INCOME':
                total_income += amount
            else:
                total_expenses += amount

        return {
            'month': month,
            'year': year,
            'total_income': total_income,
            'total_expenses': total_expenses,
            'balance': total_income - total_expenses,
            'entries': entries
        }

    def get_yearly_summary(self):
        """Calculate annual totals and projections"""
        monthly_summaries = []
        total_income = Decimal('0')
        total_expenses = Decimal('0')

        for month in range(1, 13):
            summary = self.get_monthly_summary(month)
            monthly_summaries.append(summary)
            total_income += summary['total_income']
            total_expenses += summary['total_expenses']

        return {
            'year': self.year,
            'total_income': total_income,
            'total_expenses': total_expenses,
            'balance': total_income - total_expenses,
            'monthly_summaries': monthly_summaries
        }


class BudgetCategory(models.Model):
    """Category for budget entries (e.g., Salary, Rent, Food)"""
    CATEGORY_TYPES = [
        ('INCOME', 'Income'),
        ('FIXED_EXPENSE', 'Fixed Expense'),
        ('VARIABLE_EXPENSE', 'Variable Expense'),
        ('SAVINGS', 'Savings'),
    ]

    INPUT_MODES = [
        ('MONTHLY', 'Monthly Input'),
        ('YEARLY', 'Yearly Input'),
        ('CUSTOM', 'Custom Period'),
    ]

    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=200)
    category_type = models.CharField(max_length=20, choices=CATEGORY_TYPES)
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    # Input mode configuration
    input_mode = models.CharField(max_length=10, choices=INPUT_MODES, default='MONTHLY')
    custom_months = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text='Number of months for custom period distribution'
    )
    yearly_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Total amount for yearly/custom input mode'
    )

    class Meta:
        ordering = ['budget', 'order', 'name']
        verbose_name_plural = 'Budget Categories'
        unique_together = ['budget', 'name']

    def __str__(self):
        return f"{self.budget.name} - {self.name} ({self.get_category_type_display()})"

    def get_monthly_total(self, month, year=None):
        """Sum all entries for this category in a specific month"""
        if year is None:
            year = self.budget.year

        entries = self.entries.filter(month=month, year=year)
        total_planned = sum(Decimal(e.planned_amount) for e in entries)
        total_actual = sum(
            Decimal(e.actual_amount) if e.actual_amount else Decimal('0')
            for e in entries
        )

        return {
            'month': month,
            'year': year,
            'total_planned': total_planned,
            'total_actual': total_actual
        }

    def get_yearly_total(self):
        """Sum all entries for this category across the year"""
        entries = self.entries.filter(year=self.budget.year)
        total_planned = sum(Decimal(e.planned_amount) for e in entries)
        total_actual = sum(
            Decimal(e.actual_amount) if e.actual_amount else Decimal('0')
            for e in entries
        )

        return {
            'year': self.budget.year,
            'total_planned': total_planned,
            'total_actual': total_actual
        }


class BudgetEntry(models.Model):
    """Individual budget entry for a category in a specific month"""
    STATUS_CHOICES = [
        ('WITHIN_BUDGET', 'Within Budget'),
        ('WARNING', 'Warning'),
        ('OVER_BUDGET', 'Over Budget'),
    ]

    category = models.ForeignKey(
        BudgetCategory,
        on_delete=models.CASCADE,
        related_name='entries'
    )
    month = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)]
    )
    year = models.IntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(2100)]
    )
    planned_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    actual_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='WITHIN_BUDGET'
    )

    class Meta:
        ordering = ['year', 'month', 'category__order']
        verbose_name_plural = 'Budget Entries'
        unique_together = ['category', 'month', 'year']

    def __str__(self):
        return f"{self.category.name} - {self.year}/{self.month:02d}"

    def calculate_status(self):
        """Auto-determine status based on actual vs planned amounts"""
        if not self.actual_amount or self.actual_amount == 0:
            return 'WITHIN_BUDGET'

        planned = Decimal(self.planned_amount)
        actual = Decimal(self.actual_amount)

        if planned == 0:
            return 'OVER_BUDGET' if actual > 0 else 'WITHIN_BUDGET'

        percentage = (actual / planned) * 100

        # For income, we want actual to be >= planned
        if self.category.category_type == 'INCOME':
            if percentage >= 100:
                return 'WITHIN_BUDGET'
            elif percentage >= 90:
                return 'WARNING'
            else:
                return 'OVER_BUDGET'
        # For expenses, we want actual to be <= planned
        else:
            if percentage <= 90:
                return 'WITHIN_BUDGET'
            elif percentage <= 100:
                return 'WARNING'
            else:
                return 'OVER_BUDGET'

    def save(self, *args, **kwargs):
        """Auto-calculate status before saving"""
        self.status = self.calculate_status()
        super().save(*args, **kwargs)


class BudgetTemplate(models.Model):
    """Template for quick budget creation with predefined categories"""
    name = models.CharField(max_length=200, unique=True)
    categories = models.JSONField(
        default=list,
        help_text="List of category definitions with name, type, and order"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def apply_to_budget(self, budget):
        """Create categories in the given budget based on this template"""
        created_categories = []

        for cat_data in self.categories:
            category, created = BudgetCategory.objects.get_or_create(
                budget=budget,
                name=cat_data['name'],
                defaults={
                    'category_type': cat_data['category_type'],
                    'order': cat_data.get('order', 0)
                }
            )
            if created:
                created_categories.append(category)

        return created_categories
