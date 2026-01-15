import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";

import dotenv from "dotenv";
import path from "path";

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

console.log("Environment variables loaded:");
console.log("AWS_REGION:", process.env.AWS_REGION);
console.log("AWS_ACCESS_KEY_ID:", process.env.AWS_ACCESS_KEY_ID ? "✓ Set" : "✗ Missing");
console.log("AWS_SECRET_ACCESS_KEY:", process.env.AWS_SECRET_ACCESS_KEY ? "✓ Set" : "✗ Missing");
console.log("DYNAMODB_TABLE_PREFIX:", process.env.DYNAMODB_TABLE_PREFIX);

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || "email-genie";

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && (error as { name?: string }).name === "ResourceNotFoundException") {
      return false;
    }
    throw error;
  }
}

async function createGmailAccountsTable() {
  const tableName = `${TABLE_PREFIX}-gmail-accounts`;

  if (await tableExists(tableName)) {
    console.log(`✓ Table ${tableName} already exists`);
    return;
  }

  console.log(`Creating table ${tableName}...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  console.log(`✓ Table ${tableName} created successfully`);
}

async function createCategorizationRulesTable() {
  const tableName = `${TABLE_PREFIX}-categorization-rules`;

  if (await tableExists(tableName)) {
    console.log(`✓ Table ${tableName} already exists`);
    return;
  }

  console.log(`Creating table ${tableName}...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "priority", AttributeType: "N" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "priority", KeyType: "RANGE" },
          ],
          Projection: {
            ProjectionType: "ALL",
          },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  console.log(`✓ Table ${tableName} created successfully`);
}

async function createEmailLogsTable() {
  const tableName = `${TABLE_PREFIX}-email-logs`;

  if (await tableExists(tableName)) {
    console.log(`✓ Table ${tableName} already exists`);
    return;
  }

  console.log(`Creating table ${tableName}...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  console.log(`✓ Table ${tableName} created successfully`);

  // Enable TTL on the table
  console.log(`Enabling TTL on ${tableName}...`);
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        Enabled: true,
        AttributeName: "ttl",
      },
    })
  );

  console.log(`✓ TTL enabled on ${tableName}`);
}

async function main() {
  console.log("Setting up DynamoDB tables...\n");

  try {
    await createGmailAccountsTable();
    await createCategorizationRulesTable();
    await createEmailLogsTable();

    console.log("\n✓ All tables created successfully!");
    console.log("\nNote: Tables may take a few moments to become active.");
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }
}

main();
