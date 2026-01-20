from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import IntegrityError
from .models import Budget, BudgetCategory, BudgetEntry, BudgetTemplate, TaxEntry, SalaryReduction, MonthlyActualBalance
from .serializers import (
    BudgetSerializer,
    BudgetCategorySerializer,
    BudgetEntrySerializer,
    BudgetTemplateSerializer,
    TaxEntrySerializer,
    SalaryReductionSerializer,
    MonthlySummarySerializer,
    YearlySummarySerializer,
    BudgetSummarySerializer,
    MonthlyActualBalanceSerializer,
)
from .utils import export_budget_to_excel


class BudgetViewSet(viewsets.ModelViewSet):
    """ViewSet for Budget model"""
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer
    
    @action(detail=False, methods=['get'])
    def health(self, request):
        """Health check endpoint"""
        return Response({'status': 'ok', 'message': 'Backend is running'})
    
    def create(self, request, *args, **kwargs):
        """Override create to ensure proper response with ID"""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info(f"Budget creation request received: {request.data}")
            serializer = self.get_serializer(data=request.data)
            
            if not serializer.is_valid():
                logger.error(f"Serializer validation failed: {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            
            # Ensure the response includes the ID
            response_data = serializer.data
            if 'id' not in response_data and hasattr(serializer.instance, 'id'):
                response_data['id'] = serializer.instance.id
            
            logger.info(f"Budget created successfully with ID: {response_data.get('id')}")
            logger.info(f"Response data: {response_data}")
            
            return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            logger.error(f"Error creating budget: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e), 'message': f'Error creating budget: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get complete budget summary with categories and entries"""
        budget = self.get_object()
        categories = budget.categories.filter(is_active=True)
        entries = BudgetEntry.objects.filter(
            category__budget=budget
        ).select_related('category')
        tax_entries = budget.tax_entries.filter(is_active=True)
        salary_reductions = budget.salary_reductions.filter(is_active=True)
        actual_balances = budget.actual_balances.all()

        data = {
            'budget': budget,
            'categories': categories,
            'entries': entries,
            'tax_entries': tax_entries,
            'salary_reductions': salary_reductions,
            'actual_balances': actual_balances
        }

        serializer = BudgetSummarySerializer(data)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='monthly/(?P<month>[0-9]+)')
    def monthly(self, request, pk=None, month=None):
        """Get monthly summary for a specific month and year"""
        budget = self.get_object()
        month = int(month)
        year = request.query_params.get('year', None)

        if month < 1 or month > 12:
            return Response(
                {'error': 'Month must be between 1 and 12'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if year is None:
            return Response(
                {'error': 'Year parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            year = int(year)
        except (ValueError, TypeError):
            return Response(
                {'error': 'Year must be a valid integer'},
                status=status.HTTP_400_BAD_REQUEST
            )

        summary = budget.get_monthly_summary(month, year)
        serializer = MonthlySummarySerializer(summary)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def yearly(self, request, pk=None):
        """Get yearly summary with all months for a specific year"""
        budget = self.get_object()
        year = request.query_params.get('year', None)

        if year is None:
            return Response(
                {'error': 'Year parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            year = int(year)
        except (ValueError, TypeError):
            return Response(
                {'error': 'Year must be a valid integer'},
                status=status.HTTP_400_BAD_REQUEST
            )

        summary = budget.get_yearly_summary(year)
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

    @action(detail=False, methods=['post'], url_path='import')
    def import_budget(self, request):
        """Import a budget from JSON data"""
        
        data = request.data
        budget_data = data.get('budget', {})
        categories_data = data.get('categories', [])
        entries_data = data.get('entries', [])
        tax_entries_data = data.get('tax_entries', [])
        salary_reductions_data = data.get('salary_reductions', [])
        actual_balances_data = data.get('actual_balances', [])

        # Create the budget - handle duplicate names by appending timestamp
        budget_name = budget_data.get('name', 'Imported Budget')
        # Check if name already exists and append timestamp if needed
        if Budget.objects.filter(name=budget_name).exists():
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            budget_name = f"{budget_name} (Import {timestamp})"
        
        budget_serializer = BudgetSerializer(data={
            'name': budget_name,
            'currency': budget_data.get('currency', 'CHF'),
        })
        if not budget_serializer.is_valid():
            return Response(budget_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        budget = budget_serializer.save()

        # Create categories
        category_id_mapping = {}  # Map old category IDs to new ones
        for cat_data in categories_data:
            old_id = cat_data.get('id')
            category_serializer = BudgetCategorySerializer(data={
                'name': cat_data.get('name'),
                'category_type': cat_data.get('category_type'),
                'order': cat_data.get('order', 0),
                'is_active': cat_data.get('is_active', True),
                'input_mode': cat_data.get('input_mode', 'MONTHLY'),
                'custom_months': cat_data.get('custom_months'),
                'custom_start_month': cat_data.get('custom_start_month'),
                'yearly_amount': cat_data.get('yearly_amount'),
            })
            if category_serializer.is_valid():
                category = category_serializer.save(budget=budget)
                if old_id:
                    category_id_mapping[old_id] = category.id
            else:
                budget.delete()  # Clean up on error
                return Response(category_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Create entries
        for entry_data in entries_data:
            old_category_id = entry_data.get('category')
            new_category_id = category_id_mapping.get(old_category_id)
            if not new_category_id:
                continue  # Skip if category mapping not found
            
            entry_serializer = BudgetEntrySerializer(data={
                'category': new_category_id,
                'month': entry_data.get('month'),
                'year': entry_data.get('year'),
                'planned_amount': entry_data.get('planned_amount'),
                'actual_amount': entry_data.get('actual_amount'),
                'notes': entry_data.get('notes', ''),
            })
            if entry_serializer.is_valid():
                entry_serializer.save()
            else:
                budget.delete()  # Clean up on error
                return Response(entry_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Create tax entries
        for tax_data in tax_entries_data:
            tax_serializer = TaxEntrySerializer(data={
                'name': tax_data.get('name'),
                'percentage': tax_data.get('percentage'),
                'order': tax_data.get('order', 0),
                'is_active': tax_data.get('is_active', True),
            })
            if tax_serializer.is_valid():
                tax_serializer.save(budget=budget)
            else:
                budget.delete()  # Clean up on error
                return Response(tax_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Create salary reductions
        for reduction_data in salary_reductions_data:
            reduction_serializer = SalaryReductionSerializer(data={
                'name': reduction_data.get('name'),
                'reduction_type': reduction_data.get('reduction_type'),
                'value': reduction_data.get('value'),
                'order': reduction_data.get('order', 0),
                'is_active': reduction_data.get('is_active', True),
            })
            if reduction_serializer.is_valid():
                reduction_serializer.save(budget=budget)
            else:
                budget.delete()  # Clean up on error
                return Response(reduction_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Create actual balances
        for balance_data in actual_balances_data:
            balance_serializer = MonthlyActualBalanceSerializer(data={
                'month': balance_data.get('month'),
                'year': balance_data.get('year'),
                'actual_income': balance_data.get('actual_income'),
                'actual_expenses': balance_data.get('actual_expenses'),
            })
            if balance_serializer.is_valid():
                balance_serializer.save(budget=budget)
            else:
                budget.delete()  # Clean up on error
                return Response(balance_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Return the created budget
        budget_serializer = BudgetSerializer(budget)
        return Response(budget_serializer.data, status=status.HTTP_201_CREATED)


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


class SalaryReductionViewSet(viewsets.ModelViewSet):
    """ViewSet for SalaryReduction model"""
    queryset = SalaryReduction.objects.all()
    serializer_class = SalaryReductionSerializer

    def get_queryset(self):
        """Filter by budget if provided"""
        queryset = super().get_queryset()
        budget_id = self.request.query_params.get('budget', None)

        if budget_id is not None:
            queryset = queryset.filter(budget_id=budget_id)

        return queryset

    def perform_create(self, serializer):
        """Set budget when creating salary reduction"""
        budget_id = self.request.data.get('budget')
        if budget_id:
            budget = get_object_or_404(Budget, pk=budget_id)
            serializer.save(budget=budget)
        else:
            serializer.save()


class TaxEntryViewSet(viewsets.ModelViewSet):
    """ViewSet for TaxEntry model"""
    queryset = TaxEntry.objects.all()
    serializer_class = TaxEntrySerializer

    def get_queryset(self):
        """Filter by budget if provided"""
        queryset = super().get_queryset()
        budget_id = self.request.query_params.get('budget', None)

        if budget_id is not None:
            queryset = queryset.filter(budget_id=budget_id)

        return queryset

    def perform_create(self, serializer):
        """Set budget when creating tax entry"""
        budget_id = self.request.data.get('budget')
        if budget_id:
            budget = get_object_or_404(Budget, pk=budget_id)
            serializer.save(budget=budget)
        else:
            serializer.save()


class MonthlyActualBalanceViewSet(viewsets.ModelViewSet):
    """ViewSet for MonthlyActualBalance model"""
    queryset = MonthlyActualBalance.objects.all()
    serializer_class = MonthlyActualBalanceSerializer

    def get_queryset(self):
        """Filter by budget, month, or year if provided"""
        queryset = super().get_queryset()
        budget_id = self.request.query_params.get('budget', None)
        month = self.request.query_params.get('month', None)
        year = self.request.query_params.get('year', None)

        if budget_id is not None:
            queryset = queryset.filter(budget_id=budget_id)
        if month is not None:
            queryset = queryset.filter(month=month)
        if year is not None:
            queryset = queryset.filter(year=year)

        return queryset

    def perform_create(self, serializer):
        """Set budget when creating actual balance"""
        budget_id = self.request.data.get('budget')
        if budget_id:
            budget = get_object_or_404(Budget, pk=budget_id)
            serializer.save(budget=budget)
        else:
            serializer.save()


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

    @action(detail=False, methods=['post'])
    def create_from_budget(self, request):
        """Create a template from an existing budget (categories without values)"""
        budget_id = request.data.get('budget_id')
        template_name = request.data.get('name')
        overwrite = request.data.get('overwrite', False)

        if not budget_id:
            return Response(
                {'error': 'budget_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not template_name:
            return Response(
                {'error': 'name is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        budget = get_object_or_404(Budget, pk=budget_id)
        categories = budget.categories.filter(is_active=True).order_by('order', 'name')

        # Build category data without values
        category_data = []
        for category in categories:
            category_data.append({
                'name': category.name,
                'category_type': category.category_type,
                'order': category.order,
                'input_mode': category.input_mode,
                'custom_months': category.custom_months,
                'custom_start_month': category.custom_start_month,
                # Note: yearly_amount is NOT included - templates don't store values
            })

        # Check if template with this name already exists
        existing_template = BudgetTemplate.objects.filter(name=template_name).first()
        
        if existing_template:
            if overwrite:
                # Update existing template
                existing_template.categories = category_data
                existing_template.save()
                serializer = BudgetTemplateSerializer(existing_template)
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                # Return error indicating duplicate name
                return Response(
                    {'error': 'DUPLICATE_NAME', 'message': f'Eine Vorlage mit dem Namen "{template_name}" existiert bereits.'},
                    status=status.HTTP_409_CONFLICT
                )

        # Create new template
        try:
            template = BudgetTemplate.objects.create(
                name=template_name,
                categories=category_data
            )
            serializer = BudgetTemplateSerializer(template)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            # Fallback in case of race condition
            return Response(
                {'error': 'DUPLICATE_NAME', 'message': f'Eine Vorlage mit dem Namen "{template_name}" existiert bereits.'},
                status=status.HTTP_409_CONFLICT
            )
