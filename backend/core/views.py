from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Budget, BudgetCategory, BudgetEntry, BudgetTemplate
from .serializers import (
    BudgetSerializer,
    BudgetCategorySerializer,
    BudgetEntrySerializer,
    BudgetTemplateSerializer,
    MonthlySummarySerializer,
    YearlySummarySerializer,
    BudgetSummarySerializer,
)
from .utils import export_budget_to_excel


class BudgetViewSet(viewsets.ModelViewSet):
    """ViewSet for Budget model"""
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get complete budget summary with categories and entries"""
        budget = self.get_object()
        categories = budget.categories.filter(is_active=True)
        entries = BudgetEntry.objects.filter(
            category__budget=budget
        ).select_related('category')

        data = {
            'budget': budget,
            'categories': categories,
            'entries': entries
        }

        serializer = BudgetSummarySerializer(data)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='monthly/(?P<month>[0-9]+)')
    def monthly(self, request, pk=None, month=None):
        """Get monthly summary for a specific month"""
        budget = self.get_object()
        month = int(month)

        if month < 1 or month > 12:
            return Response(
                {'error': 'Month must be between 1 and 12'},
                status=status.HTTP_400_BAD_REQUEST
            )

        summary = budget.get_monthly_summary(month)
        serializer = MonthlySummarySerializer(summary)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def yearly(self, request, pk=None):
        """Get yearly summary with all months"""
        budget = self.get_object()
        summary = budget.get_yearly_summary()
        serializer = YearlySummarySerializer(summary)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def categories(self, request, pk=None):
        """Get all categories for this budget"""
        budget = self.get_object()
        categories = budget.categories.filter(is_active=True)
        serializer = BudgetCategorySerializer(categories, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_category(self, request, pk=None):
        """Add a new category to this budget"""
        budget = self.get_object()
        serializer = BudgetCategorySerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(budget=budget)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def export(self, request, pk=None):
        """Export budget to Excel format"""
        budget = self.get_object()
        return export_budget_to_excel(budget)


class BudgetCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetCategory model"""
    queryset = BudgetCategory.objects.all()
    serializer_class = BudgetCategorySerializer

    def get_queryset(self):
        """Filter by budget if provided"""
        queryset = super().get_queryset()
        budget_id = self.request.query_params.get('budget', None)

        if budget_id is not None:
            queryset = queryset.filter(budget_id=budget_id)

        return queryset

    @action(detail=True, methods=['patch'])
    def reorder(self, request, pk=None):
        """Update the order of a category"""
        category = self.get_object()
        new_order = request.data.get('order')

        if new_order is None:
            return Response(
                {'error': 'Order field is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        category.order = new_order
        category.save()

        serializer = self.get_serializer(category)
        return Response(serializer.data)


class BudgetEntryViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetEntry model"""
    queryset = BudgetEntry.objects.all()
    serializer_class = BudgetEntrySerializer

    def get_queryset(self):
        """Filter entries by category, month, or year if provided"""
        queryset = super().get_queryset().select_related('category')

        category_id = self.request.query_params.get('category', None)
        month = self.request.query_params.get('month', None)
        year = self.request.query_params.get('year', None)

        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        if month is not None:
            queryset = queryset.filter(month=month)
        if year is not None:
            queryset = queryset.filter(year=year)

        return queryset

    @action(detail=True, methods=['patch'])
    def actual(self, request, pk=None):
        """Update only the actual amount of an entry"""
        entry = self.get_object()
        actual_amount = request.data.get('actual_amount')

        if actual_amount is None:
            return Response(
                {'error': 'actual_amount field is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.actual_amount = actual_amount
        entry.save()  # This will auto-calculate status

        serializer = self.get_serializer(entry)
        return Response(serializer.data)


class BudgetTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetTemplate model"""
    queryset = BudgetTemplate.objects.all()
    serializer_class = BudgetTemplateSerializer

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """Apply this template to a budget"""
        template = self.get_object()
        budget_id = request.data.get('budget_id')

        if not budget_id:
            return Response(
                {'error': 'budget_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        budget = get_object_or_404(Budget, pk=budget_id)
        created_categories = template.apply_to_budget(budget)

        serializer = BudgetCategorySerializer(created_categories, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
