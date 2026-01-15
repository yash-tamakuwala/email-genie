import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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
const ACCOUNTS_TABLE = `${TABLE_PREFIX}-gmail-accounts`;

async function resetTimestamps() {
  console.log(`\n🔄 Resetting email check timestamps...\n`);
  console.log(`Table: ${ACCOUNTS_TABLE}\n`);
  
  try {
    // Scan all accounts
    const result = await dynamoDb.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
      })
    );

    const accounts = result.Items || [];
    console.log(`Found ${accounts.length} account(s)\n`);

    if (accounts.length === 0) {
      console.log("No accounts found.");
      return;
    }

    // Reset timestamp to 7 days ago
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    for (const account of accounts) {
      console.log(`Resetting timestamp for: ${account.email}`);
      console.log(`  Account ID: ${account.accountId}`);
      console.log(`  Old lastEmailCheck: ${account.lastEmailCheck ? new Date(account.lastEmailCheck).toISOString() : 'not set'}`);
      console.log(`  New lastEmailCheck: ${new Date(sevenDaysAgo).toISOString()}`);

      await dynamoDb.send(
        new UpdateCommand({
          TableName: ACCOUNTS_TABLE,
          Key: {
            pk: account.pk,
            sk: account.sk,
          },
          UpdateExpression: "SET lastEmailCheck = :lec, updatedAt = :ua",
          ExpressionAttributeValues: {
            ":lec": sevenDaysAgo,
            ":ua": new Date().toISOString(),
          },
        })
      );

      console.log(`  ✅ Updated!\n`);
    }

    console.log(`\n✅ All timestamps reset to 7 days ago.`);
    console.log(`Next email poll will fetch emails from the past 7 days.\n`);

  } catch (error) {
    console.error("❌ Error resetting timestamps:", error);
    throw error;
  }
}

// Run the script
resetTimestamps()
  .then(() => {
    console.log("🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Failed:", error);
    process.exit(1);
  });
