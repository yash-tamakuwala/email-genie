import { NextRequest, NextResponse } from "next/server";
import {
  createCategorizationRule,
  listCategorizationRules,
  updateCategorizationRule,
  deleteCategorizationRule,
} from "@/lib/dynamodb";
import { generateRuleId, SINGLE_USER_ID } from "@/lib/auth";

// GET - List all rules for a user, optionally filtered by accountId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId"); // Optional: filter rules by account
    
    // Fetch all rules for user (optionally filtered by accountId)
    const rules = await listCategorizationRules(SINGLE_USER_ID, accountId || undefined);
    
    return NextResponse.json({
      success: true,
      rules,
    });
  } catch (error: unknown) {
    console.error("Error listing rules:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Create a new rule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      accountIds = [], // Array of account IDs this rule applies to
      name,
      type,
      conditions,
      actions,
      aiPrompt,
      priority,
      enabled = true,
    } = body;
    
    // Validation
    if (!name || !type || !actions) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    if (!["AI", "condition", "hybrid"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid rule type" },
        { status: 400 }
      );
    }
    
    if (!Array.isArray(accountIds)) {
      return NextResponse.json(
        { success: false, error: "accountIds must be an array" },
        { status: 400 }
      );
    }
    
    // Create rule
    const ruleId = generateRuleId();
    const rule = await createCategorizationRule({
      ruleId,
      userId: SINGLE_USER_ID,
      accountIds,
      name,
      type,
      conditions,
      actions,
      aiPrompt,
      priority: priority ?? 100,
      enabled,
    });
    
    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error: unknown) {
    console.error("Error creating rule:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PUT - Update an existing rule
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { ruleId, ...updates } = body;
    
    if (!ruleId) {
      return NextResponse.json(
        { success: false, error: "Missing ruleId" },
        { status: 400 }
      );
    }
    
    await updateCategorizationRule(SINGLE_USER_ID, ruleId, updates);
    
    return NextResponse.json({
      success: true,
      message: "Rule updated successfully",
    });
  } catch (error: unknown) {
    console.error("Error updating rule:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a rule
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("ruleId");
    
    if (!ruleId) {
      return NextResponse.json(
        { success: false, error: "Missing ruleId" },
        { status: 400 }
      );
    }
    
    await deleteCategorizationRule(SINGLE_USER_ID, ruleId);
    
    return NextResponse.json({
      success: true,
      message: "Rule deleted successfully",
    });
  } catch (error: unknown) {
    console.error("Error deleting rule:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
