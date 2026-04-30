/**
 * Email sending helper using AWS SES.
 * Pre-built for Enhancement 13 (Super Admin Portal).
 * Fire-and-forget pattern -- catches errors silently.
 */

// Lazy-load SES SDK to avoid cold start penalty when not used
let sesClient: any = null;

async function getSesClient() {
  if (!sesClient) {
    const { SESClient } = await import('@aws-sdk/client-ses');
    sesClient = new SESClient({
      region: process.env.AWS_REGION ?? 'ap-south-1',
    });
  }
  return sesClient;
}

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

const DEFAULT_FROM = process.env.SES_FROM_EMAIL ?? 'noreply@zyphr.co.in';

/**
 * Send email via AWS SES. Fire-and-forget (catches errors, logs failures).
 * Returns true if sent successfully, false on error.
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const { SendEmailCommand } = await import('@aws-sdk/client-ses');
    const client = await getSesClient();
    const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

    await client.send(new SendEmailCommand({
      Source: params.from ?? DEFAULT_FROM,
      Destination: { ToAddresses: toAddresses },
      Message: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: params.html, Charset: 'UTF-8' } },
      },
    }));

    return true;
  } catch (err) {
    console.error('[email] Failed to send email:', err);
    return false;
  }
}

/**
 * Pre-built email templates for Enhancement 13 (Super Admin Portal).
 * Each returns EmailParams ready for sendEmail().
 */
export const EMAIL_TEMPLATES = {

  schoolWelcome: (params: {
    schoolName: string;
    adminName: string;
    adminEmail: string;
    loginUrl: string;
    tempPassword: string;
    tier: string;
  }): EmailParams => ({
    to: params.adminEmail,
    subject: `Welcome to Zyphr Timetable Manager -- ${params.schoolName}`,
    html: `
      <h2>Welcome, ${params.adminName}!</h2>
      <p>Your school <strong>${params.schoolName}</strong> has been set up on Zyphr Timetable Manager.</p>
      <p><strong>Login URL:</strong> <a href="${params.loginUrl}">${params.loginUrl}</a></p>
      <p><strong>Email:</strong> ${params.adminEmail}</p>
      <p><strong>Temporary Password:</strong> ${params.tempPassword}</p>
      <p><strong>Plan:</strong> ${params.tier}</p>
      <p>Please change your password on first login.</p>
      <br/>
      <p>-- Zyphr Team</p>
    `,
  }),

  upgradeRequest: (params: {
    schoolName: string;
    currentTier: string;
    requestedTier: string;
    contactEmail: string;
    contactName: string;
  }): EmailParams => ({
    to: process.env.SUPER_ADMIN_EMAIL ?? 'admin@zyphr.co.in',
    subject: `Upgrade Request: ${params.schoolName} (${params.currentTier} → ${params.requestedTier})`,
    html: `
      <h2>Upgrade Request</h2>
      <p><strong>School:</strong> ${params.schoolName}</p>
      <p><strong>Current Plan:</strong> ${params.currentTier}</p>
      <p><strong>Requested Plan:</strong> ${params.requestedTier}</p>
      <p><strong>Contact:</strong> ${params.contactName} (${params.contactEmail})</p>
      <p>Please review this request in the Admin Portal.</p>
    `,
  }),

  upgradeApproved: (params: {
    schoolName: string;
    adminEmail: string;
    newTier: string;
    startDate: string;
    endDate: string;
  }): EmailParams => ({
    to: params.adminEmail,
    subject: `Plan Upgraded: ${params.schoolName} → ${params.newTier}`,
    html: `
      <h2>Your plan has been upgraded!</h2>
      <p><strong>School:</strong> ${params.schoolName}</p>
      <p><strong>New Plan:</strong> ${params.newTier}</p>
      <p><strong>Valid:</strong> ${params.startDate} to ${params.endDate}</p>
      <p>Enjoy the new features!</p>
      <br/>
      <p>-- Zyphr Team</p>
    `,
  }),

  upgradeRejected: (params: {
    schoolName: string;
    adminEmail: string;
    reason: string;
  }): EmailParams => ({
    to: params.adminEmail,
    subject: `Upgrade Request Update: ${params.schoolName}`,
    html: `
      <h2>Upgrade Request Update</h2>
      <p><strong>School:</strong> ${params.schoolName}</p>
      <p>Your upgrade request could not be processed at this time.</p>
      <p><strong>Reason:</strong> ${params.reason}</p>
      <p>Please contact our team for more information.</p>
      <br/>
      <p>-- Zyphr Team</p>
    `,
  }),

  subscriptionExpiring: (params: {
    schoolName: string;
    adminEmail: string;
    expiryDate: string;
  }): EmailParams => ({
    to: params.adminEmail,
    subject: `Subscription Expiring Soon: ${params.schoolName}`,
    html: `
      <h2>Your subscription is expiring soon</h2>
      <p><strong>School:</strong> ${params.schoolName}</p>
      <p><strong>Expiry Date:</strong> ${params.expiryDate}</p>
      <p>Please contact the Zyphr team to renew your subscription and avoid interruption.</p>
      <br/>
      <p>-- Zyphr Team</p>
    `,
  }),

  subscriptionExpired: (params: {
    schoolName: string;
    adminEmail: string;
  }): EmailParams => ({
    to: params.adminEmail,
    subject: `Subscription Expired: ${params.schoolName}`,
    html: `
      <h2>Your subscription has expired</h2>
      <p><strong>School:</strong> ${params.schoolName}</p>
      <p>Your account is now in read-only mode. You can view existing data but cannot make changes.</p>
      <p>Please contact the Zyphr team to renew your subscription.</p>
      <br/>
      <p>-- Zyphr Team</p>
    `,
  }),
};
