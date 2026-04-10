import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const FROM_EMAIL = "info@propelius.tech";
const TO_EMAIL = "yash@propelius.tech";

export async function sendSyncErrorNotification(
  accountEmail: string,
  accountId: string,
  errorMessage: string
): Promise<void> {
  await sesClient.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [TO_EMAIL],
      },
      Message: {
        Subject: {
          Data: `Email Genie: Sync error for ${accountEmail}`,
        },
        Body: {
          Html: {
            Data: `
              <h2>Email Genie — Account Sync Error</h2>
              <p>The following Gmail account has a sync issue and needs to be reconnected:</p>
              <table cellpadding="8" style="border-collapse:collapse;">
                <tr>
                  <td><strong>Account</strong></td>
                  <td>${accountEmail}</td>
                </tr>
                <tr>
                  <td><strong>Account ID</strong></td>
                  <td>${accountId}</td>
                </tr>
                <tr>
                  <td><strong>Error</strong></td>
                  <td>${errorMessage}</td>
                </tr>
                <tr>
                  <td><strong>Time</strong></td>
                  <td>${new Date().toISOString()}</td>
                </tr>
              </table>
              <p style="margin-top:16px;">
                <strong>Fix:</strong> Go to the
                <a href="${process.env.NEXTAUTH_URL || "https://your-app.vercel.app"}/dashboard">dashboard</a>,
                disconnect this account, and reconnect it via OAuth.
              </p>
              <p style="color:#888;font-size:12px;">You will only receive this email once per account until the issue is resolved.</p>
            `,
          },
          Text: {
            Data: `Email Genie — Account Sync Error\n\nAccount: ${accountEmail}\nAccount ID: ${accountId}\nError: ${errorMessage}\nTime: ${new Date().toISOString()}\n\nFix: Disconnect and reconnect this account from your dashboard.`,
          },
        },
      },
    })
  );
}
