"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import RuleBuilder from "@/components/RuleBuilder";
import RuleTemplate from "@/components/RuleTemplate";

type RuleType = "AI" | "condition" | "hybrid";

interface RuleConditions {
  senderEmail?: string[];
  senderDomain?: string[];
  subjectContains?: string[];
  bodyContains?: string[];
}

interface RuleActions {
  markImportant?: boolean;
  pinConversation?: boolean;
  skipInbox?: boolean;
  applyLabels?: string[];
}

interface RuleBase {
  accountIds: string[]; // Array of account IDs this rule applies to
  name: string;
  type: RuleType;
  priority: number;
  enabled: boolean;
  conditions?: RuleConditions;
  actions: RuleActions;
  aiPrompt?: string;
}

interface Rule extends RuleBase {
  ruleId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface RuleDraft extends RuleBase {
  ruleId?: string;
}

interface GmailAccount {
  accountId: string;
  email: string;
}

export default function GlobalRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [templateData, setTemplateData] = useState<RuleDraft | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/gmail/accounts");
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (err: unknown) {
      console.error("Error fetching accounts:", err);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/rules");
      const data = await response.json();

      if (data.success) {
        setRules(data.rules);
      } else {
        setError(data.error);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchRules();
  }, [fetchAccounts, fetchRules]);

  const handleSaveRule = async (rule: RuleDraft) => {
    try {
      const isUpdate = !!rule.ruleId;
      const method = isUpdate ? "PUT" : "POST";
      const response = await fetch("/api/rules", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const data = await response.json();

      if (data.success) {
        await fetchRules();
        setShowBuilder(false);
        setEditingRule(null);
        setTemplateData(null);
      } else {
        throw new Error(data.error || "Failed to save rule");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    try {
      const response = await fetch(`/api/rules?ruleId=${ruleId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        await fetchRules();
      } else {
        throw new Error(data.error || "Failed to delete rule");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  };

  const handleToggleRule = async (rule: Rule) => {
    try {
      const response = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: rule.ruleId,
          enabled: !rule.enabled,
        }),
      });
      const data = await response.json();

      if (data.success) {
        await fetchRules();
      } else {
        throw new Error(data.error || "Failed to toggle rule");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  };

  const handleCreateNew = () => {
    setEditingRule(null);
    setTemplateData(null);
    setShowBuilder(true);
    setShowTemplates(false);
  };

  const handleUseTemplate = () => {
    setEditingRule(null);
    setTemplateData(null);
    setShowBuilder(false);
    setShowTemplates(true);
  };

  const handleTemplateSelect = (template: Omit<RuleDraft, "accountIds" | "enabled">) => {
    // Add default accountIds and enabled fields for the template
    setTemplateData({
      ...template,
      accountIds: [], // User will select accounts in the builder
      enabled: true,
    });
    setShowTemplates(false);
    setShowBuilder(true);
  };

  const handleEditRule = (rule: Rule) => {
    setEditingRule(rule);
    setTemplateData(null);
    setShowBuilder(true);
    setShowTemplates(false);
  };

  const getAccountEmailsForRule = (accountIds: string[]): string => {
    if (accountIds.length === 0) return "No accounts";
    if (accountIds.length === accounts.length) return "All accounts";
    
    const emails = accountIds
      .map(id => accounts.find(acc => acc.accountId === id)?.email)
      .filter(Boolean);
    
    return emails.join(", ") || `${accountIds.length} account(s)`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Categorization Rules</h1>
            <p className="text-gray-600 mt-1">Define how emails should be categorized and labeled</p>
          </div>
        </div>

        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card 
            className="cursor-pointer hover:bg-gray-50 transition-colors border-2 border-gray-200 bg-gray-900 text-white hover:bg-gray-800"
            onClick={handleCreateNew}
          >
            <CardHeader className="flex flex-row items-center justify-center space-y-0 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">+</span>
                Create New Rule
              </CardTitle>
            </CardHeader>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-gray-50 transition-colors border-2 border-gray-200"
            onClick={handleUseTemplate}
          >
            <CardHeader className="flex flex-row items-center justify-center space-y-0 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">📋</span>
                Use Template
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:bg-gray-50 transition-colors border-2 border-gray-200 opacity-50">
            <CardHeader className="flex flex-row items-center justify-center space-y-0 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">👥</span>
                Import Rules
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Rule Builder */}
        {showBuilder && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{editingRule ? "Edit Rule" : "Create New Rule"}</CardTitle>
              <CardDescription>
                Define conditions and actions for email categorization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RuleBuilder
                accounts={accounts}
                initialRule={editingRule || templateData || undefined}
                onSave={handleSaveRule}
                onCancel={() => {
                  setShowBuilder(false);
                  setEditingRule(null);
                  setTemplateData(null);
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Template Selector */}
        {showTemplates && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Choose a Template</CardTitle>
              <CardDescription>
                Start with a pre-configured rule template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RuleTemplate
                onSelectTemplate={handleTemplateSelect}
              />
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setShowTemplates(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rules List */}
        <Card>
          <CardHeader>
            <CardTitle>Active Rules ({rules.filter(r => r.enabled).length})</CardTitle>
            <CardDescription>
              Rules are applied in priority order (lower number = higher priority)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading rules...</div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">No rules configured yet</p>
                <p className="text-sm text-gray-400 mb-4">
                  Create your first rule to start automatically categorizing emails
                </p>
                <div className="flex gap-4 justify-center">
                  <Button onClick={handleCreateNew}>Create Rule</Button>
                  <Button variant="outline" onClick={handleUseTemplate}>
                    Browse Templates
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div
                    key={rule.ruleId}
                    className={`border rounded-lg p-4 ${
                      rule.enabled ? "bg-white" : "bg-gray-50 opacity-60"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{rule.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            Priority: {rule.priority}
                          </Badge>
                          <Badge variant={rule.type === "AI" ? "default" : "secondary"}>
                            {rule.type.toUpperCase()}
                          </Badge>
                          {!rule.enabled && (
                            <Badge variant="destructive">Disabled</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          Applies to: <span className="font-medium">{getAccountEmailsForRule(rule.accountIds)}</span>
                        </p>
                        {rule.aiPrompt && (
                          <p className="text-sm text-gray-600 italic">
                            &quot;{rule.aiPrompt}&quot;
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleRule(rule)}
                        >
                          {rule.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditRule(rule)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRule(rule.ruleId)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {rule.actions.markImportant && (
                        <Badge variant="secondary" className="text-xs">⭐ Mark Important</Badge>
                      )}
                      {rule.actions.pinConversation && (
                        <Badge variant="secondary" className="text-xs">📌 Pin</Badge>
                      )}
                      {rule.actions.skipInbox && (
                        <Badge variant="secondary" className="text-xs">📭 Skip Inbox</Badge>
                      )}
                      {rule.actions.applyLabels?.map((label) => (
                        <Badge key={label} variant="secondary" className="text-xs">
                          🏷️ {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
