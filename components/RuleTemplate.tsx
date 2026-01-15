"use client";

import { Button } from "@/components/ui/button";
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
  applyLabels?: string[];
}

interface Template {
  name: string;
  description: string;
  type: RuleType;
  icon: string;
  rule: {
    type: RuleType;
    priority: number;
    conditions?: RuleConditions;
    actions: RuleActions;
    aiPrompt?: string;
  };
}

const templates: Template[] = [
  {
    name: "Newsletter Auto-Archive",
    description: "Automatically archive newsletters and promotional emails",
    type: "hybrid",
    icon: "📰",
    rule: {
      type: "hybrid",
      priority: 80,
      conditions: {
        subjectContains: ["newsletter", "unsubscribe", "promotional"],
      },
      actions: {
        skipInbox: true,
        applyLabels: ["Newsletter"],
      },
      aiPrompt:
        "Archive emails that appear to be newsletters, marketing content, or promotional materials. Look for unsubscribe links and marketing language.",
    },
  },
  {
    name: "Important Sender Detection",
    description: "Mark emails from key contacts as important",
    type: "condition",
    icon: "⭐",
    rule: {
      type: "condition",
      priority: 10,
      conditions: {
        senderDomain: ["yourcompany.com"],
      },
      actions: {
        markImportant: true,
        applyLabels: ["Important"],
      },
    },
  },
  {
    name: "Urgent Email Identification",
    description: "Identify and flag urgent emails using AI",
    type: "AI",
    icon: "🚨",
    rule: {
      type: "AI",
      priority: 5,
      actions: {
        markImportant: true,
        applyLabels: ["Urgent"],
      },
      aiPrompt:
        "Mark emails as urgent if they contain time-sensitive information, mention deadlines within 48 hours, use urgent language, or require immediate action. Examples: 'ASAP', 'urgent', 'by EOD', 'deadline tomorrow'.",
    },
  },
  {
    name: "Customer Support Priority",
    description: "Prioritize customer support and inquiry emails",
    type: "hybrid",
    icon: "💬",
    rule: {
      type: "hybrid",
      priority: 20,
      conditions: {
        subjectContains: ["support", "help", "question", "issue"],
      },
      actions: {
        markImportant: true,
        applyLabels: ["Support"],
      },
      aiPrompt:
        "Identify customer support requests, questions, or issues that need attention. Look for problem descriptions, help requests, or customer complaints.",
    },
  },
  {
    name: "Personal vs Work Categorization",
    description: "Separate personal and work-related emails",
    type: "AI",
    icon: "🏢",
    rule: {
      type: "AI",
      priority: 90,
      actions: {
        applyLabels: [],
      },
      aiPrompt:
        "Categorize emails as either 'Work' or 'Personal'. Work emails include business correspondence, project updates, meeting invitations, and professional communications. Personal emails include family, friends, personal accounts, and non-work related content.",
    },
  },
  {
    name: "Invoice & Payment Tracking",
    description: "Organize invoices and payment-related emails",
    type: "condition",
    icon: "💳",
    rule: {
      type: "condition",
      priority: 30,
      conditions: {
        subjectContains: ["invoice", "payment", "receipt", "billing"],
      },
      actions: {
        applyLabels: ["Finance", "Invoice"],
      },
    },
  },
];

interface RuleTemplateProps {
  onSelectTemplate: (template: Omit<Template["rule"], "priority" | "type"> & {
    name: string;
    type: RuleType;
    priority: number;
    conditions?: RuleConditions;
    actions: RuleActions;
    aiPrompt?: string;
  }) => void;
}

export default function RuleTemplate({ onSelectTemplate }: RuleTemplateProps) {
  const handleSelect = (template: Template) => {
    onSelectTemplate({
      name: template.name,
      ...template.rule,
    });
  };

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <Card key={template.name} className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{template.icon}</span>
                <div>
                  <CardTitle className="text-base">{template.name}</CardTitle>
                </div>
              </div>
              <Badge variant="outline">{template.type}</Badge>
            </div>
            <CardDescription className="text-sm">{template.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleSelect(template)}
            >
              Use Template
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
