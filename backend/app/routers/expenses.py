from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.db import db

router = APIRouter(tags=["Expenses"])

expenses_collection = db["expenses"]
budgets_collection = db["expense_budgets"]


class ExpenseCreate(BaseModel):
    tripId: str | None = None
    category: str = Field(min_length=1)
    amount: float = Field(gt=0)
    description: str = ""
    expenseDate: str


class BudgetCreate(BaseModel):
    budget: float = Field(ge=0)
    currency: str = "PKR"


def get_user_id(user: Any) -> str:
    if isinstance(user, dict):
        value = user.get("_id") or user.get("id") or user.get("userId")
    else:
        value = (
            getattr(user, "id", None)
            or getattr(user, "_id", None)
            or getattr(user, "userId", None)
        )

    if value is None:
        raise HTTPException(status_code=401, detail="Invalid user session")

    return str(value)


def trip_filter(user_id: str, trip_id: str | None):
    return {"userId": user_id, "tripId": trip_id or None}


def serialize(document):
    document.pop("_id", None)
    return document


@router.get("/api/expenses")
async def get_expenses(
    tripId: str | None = None,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)
    cursor = expenses_collection.find(trip_filter(user_id, tripId)).sort(
        [("expenseDate", -1), ("createdAt", -1)]
    )
    results = []

    async for item in cursor:
        results.append(serialize(item))

    return results


@router.post("/api/expenses")
async def create_expense(
    expense: ExpenseCreate,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)

    budget_doc = await budgets_collection.find_one(
        trip_filter(user_id, expense.tripId)
    )
    currency = budget_doc.get("currency", "PKR") if budget_doc else "PKR"

    item = expense.model_dump()
    item["id"] = str(uuid4())
    item["userId"] = user_id
    item["currency"] = currency
    item["createdAt"] = datetime.now(timezone.utc).isoformat()

    await expenses_collection.insert_one(item)
    return serialize(item)


@router.put("/api/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    expense: ExpenseCreate,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)
    existing = await expenses_collection.find_one(
        {"id": expense_id, "userId": user_id}
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")

    item = expense.model_dump()
    item["id"] = expense_id
    item["userId"] = user_id
    item["currency"] = existing.get("currency", "PKR")
    item["createdAt"] = existing.get(
        "createdAt", datetime.now(timezone.utc).isoformat()
    )

    await expenses_collection.replace_one(
        {"id": expense_id, "userId": user_id}, item
    )
    return item


@router.delete("/api/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)
    result = await expenses_collection.delete_one(
        {"id": expense_id, "userId": user_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")

    return {"message": "Expense deleted"}


@router.get("/api/expenses/budget")
async def get_budget(
    tripId: str | None = None,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)
    budget = await budgets_collection.find_one(trip_filter(user_id, tripId))

    if not budget:
        return {
            "tripId": tripId,
            "budget": 0,
            "currency": "PKR",
        }

    budget.pop("_id", None)
    return budget


@router.post("/api/expenses/set-budget")
async def save_budget(
    budget: BudgetCreate,
    tripId: str | None = None,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)

    data = {
        "userId": user_id,
        "tripId": tripId or None,
        "budget": budget.budget,
        "currency": budget.currency,
    }

    await budgets_collection.update_one(
        trip_filter(user_id, tripId),
        {"$set": data},
        upsert=True,
    )

    return data


@router.get("/api/expenses/summary")
async def get_expense_summary(
    tripId: str | None = None,
    user: dict = Depends(get_current_user),
):
    user_id = get_user_id(user)
    query = trip_filter(user_id, tripId)
    cursor = expenses_collection.find(query)

    expenses = []
    async for item in cursor:
        expenses.append(item)

    total_spent = sum(float(item.get("amount", 0)) for item in expenses)

    budget_doc = await budgets_collection.find_one(query)
    budget = float(budget_doc.get("budget", 0)) if budget_doc else 0
    currency = budget_doc.get("currency", "PKR") if budget_doc else "PKR"

    category_totals = {}
    day_totals = {}

    for item in expenses:
        category = item.get("category", "other")
        amount = float(item.get("amount", 0))
        category_totals[category] = category_totals.get(category, 0) + amount

        day = item.get("expenseDate", "")
        day_totals[day] = day_totals.get(day, 0) + amount

    remaining = budget - total_spent
    percent_used = round(total_spent / budget * 100, 2) if budget else 0

    return {
        "tripId": tripId,
        "budget": budget,
        "totalSpent": total_spent,
        "remaining": remaining,
        "percentUsed": percent_used,
        "currency": currency,
        "byCategory": [
            {"category": key, "total": value}
            for key, value in category_totals.items()
        ],
        "byDay": [
            {"date": key, "total": value}
            for key, value in sorted(day_totals.items())
        ],
    }