from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'budgets', views.BudgetViewSet, basename='budget')
router.register(r'categories', views.BudgetCategoryViewSet, basename='category')
router.register(r'entries', views.BudgetEntryViewSet, basename='entry')
router.register(r'salary-reductions', views.SalaryReductionViewSet, basename='salary-reduction')
router.register(r'taxes', views.TaxEntryViewSet, basename='tax')
router.register(r'actual-balances', views.MonthlyActualBalanceViewSet, basename='actual-balance')
router.register(r'templates', views.BudgetTemplateViewSet, basename='template')

urlpatterns = [
    path('', include(router.urls)),
]
