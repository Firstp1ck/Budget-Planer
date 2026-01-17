# Budget Planer

A modern web-based budget planning application with Django REST Framework backend and React/TypeScript frontend.

## Features

- Create and manage multiple budgets for different years
- Organize expenses and income into categories (Income, Fixed Expenses, Variable Expenses, Savings)
- Track planned vs actual amounts for each month
- Visual status indicators (green/yellow/red) based on budget performance
- Auto-calculations for monthly and yearly totals
- Export budgets to Excel format
- Dark mode support
- Responsive design for desktop, tablet, and mobile

## Technology Stack

### Backend
- Django 5.0
- Django REST Framework 3.14
- SQLite database
- Python 3.10+

### Frontend
- React 19
- TypeScript 5.7
- Vite 6.0
- Tailwind CSS 4.1
- React Router 7.1
- TanStack Query (React Query)
- Recharts for visualizations

## Project Structure

```
Budget-Planer/
├── backend/                 # Django REST API
│   ├── config/             # Project settings
│   ├── core/               # Main app
│   │   ├── models.py       # Budget models
│   │   ├── serializers.py  # DRF serializers
│   │   ├── views.py        # API views
│   │   ├── urls.py         # URL routing
│   │   ├── utils.py        # Excel export utilities
│   │   ├── admin.py        # Django admin configuration
│   │   └── tests.py        # Backend tests
│   ├── manage.py
│   └── requirements.txt
├── frontend/               # React + TypeScript
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable components
│   │   ├── services/       # API client
│   │   ├── types/          # TypeScript types
│   │   └── hooks/          # Custom React hooks
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Installation

### Prerequisites
- Python 3.10 or higher
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer (`brew install uv` on macOS)
- Node.js 18 or higher
- npm or bun

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment with uv:
```bash
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies with uv:
```bash
uv pip install -r requirements.txt
```

4. Copy the environment example file:
```bash
cp .env.example .env
```

5. Generate a Django secret key and add it to `.env`:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

6. Run migrations:
```bash
python manage.py migrate
```

7. Create a superuser (optional):
```bash
python manage.py createsuperuser
```

8. Start the development server:
```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000`

**Why uv?** uv is a fast Python package installer written in Rust, offering 10-100x faster installation than pip.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Start the development server:
```bash
npm run dev
# or
bun run dev
```

The application will be available at `http://localhost:5173`

## Usage

### Creating a Budget

1. Open the application at `http://localhost:5173`
2. Click "Neues Budget erstellen" (Create New Budget)
3. Enter a name and year for your budget
4. Click "Erstellen" (Create)

### Adding Categories

1. Open a budget from the dashboard
2. Click "+ Kategorie hinzufügen" (Add Category)
3. Enter a category name and select its type:
   - **Einnahme** (Income): Money you receive
   - **Fixkosten** (Fixed Expense): Recurring expenses
   - **Variable Kosten** (Variable Expense): Non-recurring expenses
   - **Sparen** (Savings): Money you're saving

### Adding Budget Entries

1. Click on any cell in the monthly grid
2. Enter the planned amount
3. Optionally enter the actual amount
4. Click "OK" to save

### Status Colors

- **Green**: Within budget (≤90% for expenses, ≥100% for income)
- **Yellow**: Warning (90-100% for expenses, 90-100% for income)
- **Red**: Over budget (>100% for expenses, <90% for income)

### Exporting to Excel

Budget exports are available through the API:
```bash
GET /api/budgets/{id}/export/
```

This will download an Excel file with the same structure as the original Numbers file.

## API Endpoints

### Budgets
- `GET /api/budgets/` - List all budgets
- `POST /api/budgets/` - Create a new budget
- `GET /api/budgets/{id}/` - Get budget details
- `PUT /api/budgets/{id}/` - Update budget
- `DELETE /api/budgets/{id}/` - Delete budget
- `GET /api/budgets/{id}/summary/` - Get full budget summary
- `GET /api/budgets/{id}/monthly/{month}/` - Get monthly summary
- `GET /api/budgets/{id}/yearly/` - Get yearly summary
- `GET /api/budgets/{id}/export/` - Export to Excel

### Categories
- `GET /api/categories/` - List categories
- `POST /api/categories/` - Create category
- `PUT /api/categories/{id}/` - Update category
- `DELETE /api/categories/{id}/` - Delete category
- `PATCH /api/categories/{id}/reorder/` - Reorder category

### Entries
- `GET /api/entries/` - List entries (with filters)
- `POST /api/entries/` - Create entry
- `PUT /api/entries/{id}/` - Update entry
- `DELETE /api/entries/{id}/` - Delete entry
- `PATCH /api/entries/{id}/actual/` - Update actual amount

### Templates
- `GET /api/templates/` - List templates
- `POST /api/templates/` - Create template
- `DELETE /api/templates/{id}/` - Delete template
- `POST /api/templates/{id}/apply/` - Apply template to budget

## Running Tests

### Backend Tests
```bash
cd backend
python manage.py test
```

### Frontend Tests
```bash
cd frontend
npm test
# or
bun test
```

## Environment Variables

### Backend (.env)
```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend
No environment variables required for development.

## Database Models

### Budget
- Main budget container
- Fields: name, year, currency, created_at, updated_at

### BudgetCategory
- Category for organizing entries
- Fields: budget, name, category_type, order, is_active
- Types: INCOME, FIXED_EXPENSE, VARIABLE_EXPENSE, SAVINGS

### BudgetEntry
- Individual monthly budget entry
- Fields: category, month, year, planned_amount, actual_amount, notes, status
- Status auto-calculated based on planned vs actual

### BudgetTemplate
- Reusable category templates
- Fields: name, categories (JSON)

## Development

### Code Style
- Backend: Follow PEP 8
- Frontend: ESLint + TypeScript strict mode

### Building for Production

Backend:
```bash
python manage.py collectstatic
```

Frontend:
```bash
npm run build
# or
bun run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please create an issue in the GitHub repository.

## Acknowledgments

Based on the Budget_Brigitte_2026.numbers spreadsheet structure, providing a web-based alternative with enhanced features.
