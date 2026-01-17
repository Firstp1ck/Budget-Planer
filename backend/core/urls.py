from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'budgets', views.BudgetViewSet, basename='budget')
router.register(r'categories', views.BudgetCategoryViewSet, basename='category')
router.register(r'entries', views.BudgetEntryViewSet, basename='entry')
router.register(r'templates', views.BudgetTemplateViewSet, basename='template')

urlpatterns = [
    path('', include(router.urls)),
]
