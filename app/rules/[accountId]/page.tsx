"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  accountId: string;
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
  createdAt: string;
  updatedAt: string;
}

interface RuleDraft extends RuleBase {
  ruleId?: string;
}

export default function RulesPage() {
  const params = useParams();
  const accountId = params.accountId as string;

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [templateData, setTemplateData] = useState<RuleDraft | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/rules?accountId=${accountId}`);
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
  }, [accountId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

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
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    try {
      const response = await fetch(`/api/rules?accountId=${accountId}&ruleId=${ruleId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        await fetchRules();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    }
  };

  const handleToggleRule = async (rule: Rule) => {
    try {
      const response = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: rule.accountId,
          ruleId: rule.ruleId,
          enabled: !rule.enabled,
        }),
      });
      const data = await response.json();

      if (data.success) {
        await fetchRules();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    }
  };

  const handleSelectTemplate = (template: RuleDraft) => {
    setTemplateData(template);
    setShowTemplates(false);
    setShowBuilder(true);
  };

  const handleCreateNew = () => {
    setTemplateData(null);
    setEditingRule(null);
    setShowBuilder(true);
    setShowTemplates(false);
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setTemplateData(null);
    setShowBuilder(true);
    setShowTemplates(false);
  };

  if (showBuilder) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Button variant="outline" onClick={() => setShowBuilder(false)}>
              ← Back to Rules
            </Button>
          </div>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">
              {editingRule ? "Edit Rule" : templateData ? `Create: ${templateData.name}` : "Create New Rule"}
            </h2>
            <RuleBuilder
              accountId={accountId}
              existingRule={editingRule || templateData}
              onSave={handleSaveRule}
              onCancel={() => {
                setShowBuilder(false);
                setEditingRule(null);
                setTemplateData(null);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (showTemplates) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Button variant="outline" onClick={() => setShowTemplates(false)}>
              ← Back to Rules
            </Button>
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">Rule Templates</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Choose a template to get started quickly
            </p>
          </div>
          <RuleTemplate onSelectTemplate={handleSelectTemplate} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Categorization Rules</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Define how emails should be categorized and labeled
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline">← Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {error && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              Error: {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Button onClick={handleCreateNew} className="h-auto py-6">
            <div className="text-center">
              <div className="text-3xl mb-2">➕</div>
              <div className="font-semibold">Create New Rule</div>
            </div>
          </Button>
          <Button onClick={() => setShowTemplates(true)} variant="outline" className="h-auto py-6">
            <div className="text-center">
              <div className="text-3xl mb-2">📋</div>
              <div className="font-semibold">Use Template</div>
            </div>
          </Button>
          <Button variant="outline" className="h-auto py-6" disabled>
            <div className="text-center">
              <div className="text-3xl mb-2">📥</div>
              <div className="font-semibold">Import Rules</div>
            </div>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active Rules ({rules.length})</CardTitle>
            <CardDescription>
              Rules are applied in priority order (lower number = higher priority)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-500 py-8 text-center">Loading rules...</p>
            ) : rules.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">No rules configured yet</p>
                <p className="text-sm text-gray-400 mb-6">
                  Create your first rule to start automatically categorizing emails
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={handleCreateNew}>Create Rule</Button>
                  <Button variant="outline" onClick={() => setShowTemplates(true)}>
                    Browse Templates
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.ruleId}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{rule.name}</h3>
                        <Badge variant={rule.enabled ? "default" : "outline"}>
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline">{rule.type}</Badge>
                        <span className="text-sm text-gray-500">Priority: {rule.priority}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {rule.actions.markImportant && (
                          <Badge variant="outline">⭐ Mark Important</Badge>
                        )}
                        {rule.actions.skipInbox && <Badge variant="outline">📥 Archive</Badge>}
                        {rule.actions.applyLabels?.length > 0 && (
                          <Badge variant="outline">
                            🏷️ Labels: {rule.actions.applyLabels.join(", ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button size="sm" variant="outline" onClick={() => handleToggleRule(rule)}>
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEdit(rule)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteRule(rule.ruleId)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {rules.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Next Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                <li>
                  1. Background jobs will automatically process new emails
                </li>
                <li>2. Test your rules by sending emails to your connected Gmail account</li>
                <li>3. Monitor job status on the Jobs page</li>
                <li>4. Adjust rule priorities and conditions based on results</li>
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
