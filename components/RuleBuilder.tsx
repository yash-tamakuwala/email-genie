"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  markReadAndLabel?: boolean;
  applyLabels?: string[];
}

interface GmailAccount {
  accountId: string;
  email: string;
}

interface RuleInput {
  accountIds: string[]; // Changed from accountId to accountIds array
  ruleId?: string;
  name: string;
  type: RuleType;
  priority: number;
  enabled: boolean;
  conditions?: RuleConditions;
  actions: RuleActions;
  aiPrompt?: string;
}

interface RuleBuilderProps {
  accounts: GmailAccount[]; // Array of available accounts
  initialRule?: RuleInput;
  onSave: (rule: RuleInput) => Promise<void>;
  onCancel: () => void;
}

export default function RuleBuilder({ accounts, initialRule, onSave, onCancel }: RuleBuilderProps) {
  const [ruleData, setRuleData] = useState({
    name: initialRule?.name || "",
    type: initialRule?.type || ("hybrid" as RuleType),
    priority: initialRule?.priority || 100,
    enabled: initialRule?.enabled ?? true,
    accountIds: initialRule?.accountIds || [],
    conditions: {
      senderEmail: initialRule?.conditions?.senderEmail?.join(", ") || "",
      senderDomain: initialRule?.conditions?.senderDomain?.join(", ") || "",
      subjectContains: initialRule?.conditions?.subjectContains?.join(", ") || "",
      bodyContains: initialRule?.conditions?.bodyContains?.join(", ") || "",
    },
    actions: {
      markImportant: initialRule?.actions?.markImportant || false,
      pinConversation: initialRule?.actions?.pinConversation || false,
      skipInbox: initialRule?.actions?.skipInbox || false,
      markReadAndLabel: initialRule?.actions?.markReadAndLabel || false,
      applyLabels: initialRule?.actions?.applyLabels?.join(", ") || "",
    },
    aiPrompt: initialRule?.aiPrompt || "",
  });

  const [saving, setSaving] = useState(false);

  const toggleAccount = (accountId: string) => {
    setRuleData(prev => ({
      ...prev,
      accountIds: prev.accountIds.includes(accountId)
        ? prev.accountIds.filter(id => id !== accountId)
        : [...prev.accountIds, accountId]
    }));
  };

  const toggleAllAccounts = () => {
    setRuleData(prev => ({
      ...prev,
      accountIds: prev.accountIds.length === accounts.length
        ? []
        : accounts.map(acc => acc.accountId)
    }));
  };

  const handleSubmit = async () => {
    if (!ruleData.name.trim()) {
      alert("Please enter a rule name");
      return;
    }

    if (ruleData.accountIds.length === 0) {
      alert("Please select at least one account");
      return;
    }

    const hasActions = 
      ruleData.actions.markImportant ||
      ruleData.actions.pinConversation ||
      ruleData.actions.skipInbox ||
      ruleData.actions.markReadAndLabel ||
      (ruleData.actions.applyLabels && ruleData.actions.applyLabels.trim().length > 0);

    if (!hasActions) {
      alert("Please select at least one action");
      return;
    }

    const rule: RuleInput = {
      accountIds: ruleData.accountIds,
      ruleId: initialRule?.ruleId,
      name: ruleData.name,
      type: ruleData.type,
      priority: parseInt(ruleData.priority.toString()),
      enabled: ruleData.enabled,
      conditions: {
        senderEmail: ruleData.conditions.senderEmail
          ? ruleData.conditions.senderEmail.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        senderDomain: ruleData.conditions.senderDomain
          ? ruleData.conditions.senderDomain.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        subjectContains: ruleData.conditions.subjectContains
          ? ruleData.conditions.subjectContains.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        bodyContains: ruleData.conditions.bodyContains
          ? ruleData.conditions.bodyContains.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      },
      actions: {
        markImportant: ruleData.actions.markImportant,
        pinConversation: ruleData.actions.pinConversation,
        skipInbox: ruleData.actions.skipInbox,
        markReadAndLabel: ruleData.actions.markReadAndLabel,
        applyLabels: ruleData.actions.applyLabels
          ? ruleData.actions.applyLabels.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      },
      aiPrompt: ruleData.aiPrompt || undefined,
    };

    setSaving(true);
    try {
      await onSave(rule);
    } catch (error) {
      console.error("Error saving rule:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Rule Name *</Label>
          <Input
            id="name"
            value={ruleData.name}
            onChange={(e) => setRuleData({ ...ruleData, name: e.target.value })}
            placeholder="e.g., Newsletter Auto-Archive"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="type">Rule Type</Label>
            <Select
              value={ruleData.type}
              onValueChange={(value) => setRuleData({ ...ruleData, type: value as RuleType })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AI">AI - Use AI to categorize</SelectItem>
                <SelectItem value="condition">Condition - Use rule-based filters</SelectItem>
                <SelectItem value="hybrid">Hybrid - Use both AI and conditions</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="priority">Priority (lower = higher priority)</Label>
            <Input
              id="priority"
              type="number"
              value={ruleData.priority}
              onChange={(e) => setRuleData({ ...ruleData, priority: parseInt(e.target.value) || 100 })}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="enabled"
            checked={ruleData.enabled}
            onCheckedChange={(checked) => setRuleData({ ...ruleData, enabled: checked })}
          />
          <Label htmlFor="enabled">Rule enabled</Label>
        </div>
      </div>

      {/* Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply to Accounts *</CardTitle>
          <CardDescription>Select which Gmail accounts this rule should apply to</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAllAccounts}
            >
              {ruleData.accountIds.length === accounts.length ? "Deselect All" : "Select All"}
            </Button>
            <span className="text-sm text-gray-600">
              {ruleData.accountIds.length} of {accounts.length} selected
            </span>
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500">No Gmail accounts connected yet</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.accountId}
                  className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    id={`account-${account.accountId}`}
                    checked={ruleData.accountIds.includes(account.accountId)}
                    onChange={() => toggleAccount(account.accountId)}
                    className="h-4 w-4"
                  />
                  <label
                    htmlFor={`account-${account.accountId}`}
                    className="text-sm flex-1 cursor-pointer"
                  >
                    {account.email}
                  </label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Prompt (for AI and hybrid types) */}
      {(ruleData.type === "AI" || ruleData.type === "hybrid") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Categorization Prompt</CardTitle>
            <CardDescription>
              Describe what types of emails this rule should match
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={ruleData.aiPrompt}
              onChange={(e) => setRuleData({ ...ruleData, aiPrompt: e.target.value })}
              placeholder="e.g., Match all promotional emails from social media platforms"
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      {/* Conditions (for condition and hybrid types) */}
      {(ruleData.type === "condition" || ruleData.type === "hybrid") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conditions (Optional)</CardTitle>
            <CardDescription>
              Define specific conditions for filtering emails (comma-separated)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="senderEmail">Sender Email(s)</Label>
              <Input
                id="senderEmail"
                value={ruleData.conditions.senderEmail}
                onChange={(e) =>
                  setRuleData({
                    ...ruleData,
                    conditions: { ...ruleData.conditions, senderEmail: e.target.value },
                  })
                }
                placeholder="e.g., noreply@example.com, newsletter@company.com"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="senderDomain">Sender Domain(s)</Label>
              <Input
                id="senderDomain"
                value={ruleData.conditions.senderDomain}
                onChange={(e) =>
                  setRuleData({
                    ...ruleData,
                    conditions: { ...ruleData.conditions, senderDomain: e.target.value },
                  })
                }
                placeholder="e.g., facebook.com, linkedin.com"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="subjectContains">Subject Contains</Label>
              <Input
                id="subjectContains"
                value={ruleData.conditions.subjectContains}
                onChange={(e) =>
                  setRuleData({
                    ...ruleData,
                    conditions: { ...ruleData.conditions, subjectContains: e.target.value },
                  })
                }
                placeholder="e.g., Newsletter, Update, Alert"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="bodyContains">Body Contains</Label>
              <Input
                id="bodyContains"
                value={ruleData.conditions.bodyContains}
                onChange={(e) =>
                  setRuleData({
                    ...ruleData,
                    conditions: { ...ruleData.conditions, bodyContains: e.target.value },
                  })
                }
                placeholder="e.g., unsubscribe, promotional"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions *</CardTitle>
          <CardDescription>
            Define what should happen when an email matches this rule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="markImportant"
              checked={ruleData.actions.markImportant}
              onCheckedChange={(checked) =>
                setRuleData({
                  ...ruleData,
                  actions: { ...ruleData.actions, markImportant: checked },
                })
              }
            />
            <Label htmlFor="markImportant">⭐ Mark as important</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="pinConversation"
              checked={ruleData.actions.pinConversation}
              onCheckedChange={(checked) =>
                setRuleData({
                  ...ruleData,
                  actions: { ...ruleData.actions, pinConversation: checked },
                })
              }
            />
            <Label htmlFor="pinConversation">📌 Pin conversation</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="skipInbox"
              checked={ruleData.actions.skipInbox}
              onCheckedChange={(checked) =>
                setRuleData({
                  ...ruleData,
                  actions: { ...ruleData.actions, skipInbox: checked },
                })
              }
            />
            <Label htmlFor="skipInbox">📭 Skip inbox (Archive)</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="markReadAndLabel"
              checked={ruleData.actions.markReadAndLabel}
              onCheckedChange={(checked) =>
                setRuleData({
                  ...ruleData,
                  actions: { ...ruleData.actions, markReadAndLabel: checked },
                })
              }
            />
            <Label htmlFor="markReadAndLabel">👁️ Mark as read & move to label (keep in inbox for search)</Label>
          </div>

          <div>
            <Label htmlFor="applyLabels">Apply Labels</Label>
            <Input
              id="applyLabels"
              value={ruleData.actions.applyLabels}
              onChange={(e) =>
                setRuleData({
                  ...ruleData,
                  actions: { ...ruleData.actions, applyLabels: e.target.value },
                })
              }
              placeholder="e.g., Newsletter, Social Media, Promotions"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated label names</p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : initialRule ? "Update Rule" : "Create Rule"}
        </Button>
      </div>
    </div>
  );
}
