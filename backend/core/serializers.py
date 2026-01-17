from rest_framework import serializers
from .models import Budget, BudgetCategory, BudgetEntry, BudgetTemplate


class BudgetSerializer(serializers.ModelSerializer):
    """Serializer for Budget model"""

    class Meta:
        model = Budget
        fields = ['id', 'name', 'year', 'currency', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class BudgetCategorySerializer(serializers.ModelSerializer):
    """Serializer for BudgetCategory model"""
    category_type_display = serializers.CharField(
        source='get_category_type_display',
        read_only=True
    )

    class Meta:
        model = BudgetCategory
        fields = [
            'id', 'budget', 'name', 'category_type',
            'category_type_display', 'order', 'is_active'
        ]
        read_only_fields = ['id', 'budget']


class BudgetEntrySerializer(serializers.ModelSerializer):
    """Serializer for BudgetEntry model"""
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_type = serializers.CharField(source='category.category_type', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = BudgetEntry
        fields = [
            'id', 'category', 'category_name', 'category_type',
            'month', 'year', 'planned_amount', 'actual_amount',
            'notes', 'status', 'status_display'
        ]
        read_only_fields = ['status', 'status_display']


class BudgetTemplateSerializer(serializers.ModelSerializer):
    """Serializer for BudgetTemplate model"""

    class Meta:
        model = BudgetTemplate
        fields = ['id', 'name', 'categories', 'created_at']
        read_only_fields = ['created_at']


class MonthlySummarySerializer(serializers.Serializer):
    """Serializer for monthly budget summary"""
    month = serializers.IntegerField()
    year = serializers.IntegerField()
    total_income = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_expenses = serializers.DecimalField(max_digits=10, decimal_places=2)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2)
    entries = BudgetEntrySerializer(many=True, read_only=True)


class YearlySummarySerializer(serializers.Serializer):
    """Serializer for yearly budget summary"""
    year = serializers.IntegerField()
    total_income = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_expenses = serializers.DecimalField(max_digits=10, decimal_places=2)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2)
    monthly_summaries = serializers.ListField(child=serializers.DictField())


class BudgetSummarySerializer(serializers.Serializer):
    """Serializer for complete budget summary with all data"""
    budget = BudgetSerializer()
    categories = BudgetCategorySerializer(many=True)
    entries = BudgetEntrySerializer(many=True)
