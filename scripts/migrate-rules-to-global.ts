import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const dynamoDb = DynamoDBDocumentClient.from(client);
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || "email-genie";
const RULES_TABLE = `${TABLE_PREFIX}-categorization-rules`;
const SINGLE_USER_ID = "default-user";

interface OldRule {
  pk: string; // ACCOUNT#accountId
  sk: string; // RULE#ruleId
  accountId: string;
  ruleId: string;
  [key: string]: unknown;
}

interface NewRule {
  pk: string; // USER#userId
  sk: string; // RULE#ruleId
  userId: string;
  accountIds: string[];
  ruleId: string;
  [key: string]: unknown;
}

async function migrateRules() {
  console.log(`\n🔄 Migrating rules to global format...\n`);
  console.log(`Table: ${RULES_TABLE}\n`);
  
  try {
    // Scan all existing rules
    const result = await dynamoDb.send(
      new ScanCommand({
        TableName: RULES_TABLE,
      })
    );

    const oldRules = (result.Items || []) as OldRule[];
    console.log(`Found ${oldRules.length} rules to migrate\n`);

    if (oldRules.length === 0) {
      console.log("✅ No rules to migrate. You're all set!");
      return;
    }

    // Group rules by ruleId (in case there are duplicates across accounts)
    const rulesByName = new Map<string, OldRule[]>();
    
    for (const rule of oldRules) {
      const name = rule.name as string;
      if (!rulesByName.has(name)) {
        rulesByName.set(name, []);
      }
      rulesByName.get(name)!.push(rule);
    }

    console.log(`Processing ${rulesByName.size} unique rule name(s)...\n`);

    let migrated = 0;
    let skipped = 0;

    for (const [ruleName, rules] of rulesByName.entries()) {
      // Check if this is already in new format
      if (rules[0].pk.startsWith("USER#")) {
        console.log(`⏭️  Skipping "${ruleName}" (already migrated)`);
        skipped++;
        continue;
      }

      // Collect all accountIds for this rule
      const accountIds = rules.map(r => r.accountId);

      // Create new rule with all accountIds
      const firstRule = rules[0];
      const newRule: NewRule = {
        ...firstRule,
        pk: `USER#${SINGLE_USER_ID}`,
        sk: firstRule.sk, // Keep same RULE# key
        userId: SINGLE_USER_ID,
        accountIds,
      };

      // Remove old accountId field
      delete (newRule as { accountId?: string }).accountId;

      console.log(`✅ Migrating "${ruleName}"`);
      console.log(`   Old format: ${rules.length} separate rule(s) with pk=${firstRule.pk}`);
      console.log(`   New format: 1 global rule applying to ${accountIds.length} account(s)`);
      console.log(`   Account IDs: ${accountIds.join(", ")}`);

      // Delete old rules
      for (const oldRule of rules) {
        await dynamoDb.send(
          new DeleteCommand({
            TableName: RULES_TABLE,
            Key: {
              pk: oldRule.pk,
              sk: oldRule.sk,
            },
          })
        );
      }

      // Create new rule
      await dynamoDb.send(
        new PutCommand({
          TableName: RULES_TABLE,
          Item: newRule,
        })
      );

      migrated++;
      console.log("");
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated} rule(s)`);
    console.log(`   Skipped: ${skipped} rule(s) (already in new format)`);
    console.log(`   Total: ${rulesByName.size} rule(s)\n`);

  } catch (error) {
    console.error("❌ Error during migration:", error);
    throw error;
  }
}

// Run migration
migrateRules()
  .then(() => {
    console.log("🎉 All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  });
