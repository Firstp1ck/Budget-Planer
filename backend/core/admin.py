from django.contrib import admin
from .models import Budget, BudgetCategory, BudgetEntry, BudgetTemplate, MonthlyActualBalance


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ('name', 'currency', 'created_at')
    list_filter = ('currency',)
    search_fields = ('name',)


@admin.register(BudgetCategory)
class BudgetCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'budget', 'category_type', 'order', 'is_active')
    list_filter = ('category_type', 'is_active', 'budget')
    search_fields = ('name',)
    ordering = ('budget', 'order')


@admin.register(BudgetEntry)
class BudgetEntryAdmin(admin.ModelAdmin):
    list_display = ('category', 'month', 'year', 'planned_amount', 'actual_amount', 'status')
    list_filter = ('year', 'month', 'status', 'category__budget')
    search_fields = ('category__name', 'notes')
    ordering = ('year', 'month')


@admin.register(BudgetTemplate)
class BudgetTemplateAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)


@admin.register(MonthlyActualBalance)
class MonthlyActualBalanceAdmin(admin.ModelAdmin):
    list_display = ('budget', 'month', 'year', 'actual_income', 'actual_expenses', 'balance', 'updated_at')
    list_filter = ('year', 'month', 'budget')
    search_fields = ('budget__name',)
    ordering = ('year', 'month')
    readonly_fields = ('balance', 'created_at', 'updated_at')
