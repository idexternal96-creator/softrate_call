const { Resend } = require('resend');

const resend = (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) ? new Resend(process.env.RESEND_API_KEY.trim()) : null;
const FROM_EMAIL = (process.env.FROM_EMAIL && process.env.FROM_EMAIL.trim()) || 'onboarding@resend.dev';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL.trim()) || 'admin@softrate.com';

const sendEmail = async ({ to, subject, html }) => {


  try {
    const { data, error } = await resend.emails.send({
      from: `DealVoice <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error('❌ Resend Error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('❌ Mail Service Error:', err);
    return { success: false, error: err.message };
  }
};

const notifyAdminOfRequest = (company) => {
  const isTrial = company.status === 'Free-Trial-Request';
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: isTrial ? 'New Free Trial Request - DealVoice' : 'New Paid User Registered - DealVoice',
    html: `
      <h2>${isTrial ? 'New Trial Request' : 'New Paid Registration'}</h2>
      <p>A new company has ${isTrial ? 'requested a free trial' : 'registered as a paid user'}:</p>
      <ul>
        <li><strong>Company:</strong> ${company.companyName}</li>
        <li><strong>Admin:</strong> ${company.name}</li>
        <li><strong>Email:</strong> ${company.email}</li>
        <li><strong>Code:</strong> ${company.companyCode}</li>
        <li><strong>Status:</strong> ${company.status}</li>
      </ul>
      ${isTrial ? `<p><a href="http://localhost:4000/admin">Go to Admin Dashboard to Approve/Reject</a></p>` : ''}
    `,
  });
};

const notifyCompanyOfApproval = (company) => {
  return sendEmail({
    to: company.email,
    subject: 'Welcome to DealVoice! Your trial is approved',
    html: `
      <h2>Congratulations!</h2>
      <p>Hi ${company.name},</p>
      <p>Your free trial for <strong>${company.companyName}</strong> has been approved by our admin.</p>
      <p>You can now log in and start using DealVoice for the next 7 days.</p>
      <p><strong>Your Company Code:</strong> ${company.companyCode}</p>
      <p><a href="http://localhost:4200">Login Now</a></p>
      <p>After 7 days, your account will move to 'On due' status unless upgraded.</p>
    `,
  });
};

const notifyCompanyOfRejection = (email, name) => {
  return sendEmail({
    to: email,
    subject: 'Update on your DealVoice trial request',
    html: `
      <p>Hi ${name},</p>
      <p>Thank you for your interest in DealVoice. Unfortunately, your request for a free trial could not be approved at this time.</p>
      <p>If you have any questions, please contact our support team.</p>
    `,
  });
};

const notifyAdminOfRmRequest = (company) => {
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Relationship Manager Requested - ${company.companyName}`,
    html: `
      <h2>New RM Request</h2>
      <p>A company is requesting a Relationship Manager:</p>
      <ul>
        <li><strong>Company Name:</strong> ${company.companyName}</li>
        <li><strong>Company Code:</strong> ${company.companyCode}</li>
        <li><strong>Admin Name:</strong> ${company.name}</li>
        <li><strong>Admin Email:</strong> ${company.email}</li>
        <li><strong>Request Time:</strong> ${new Date().toLocaleString()}</li>
      </ul>
      <p>Please assign an RM from the Admin Dashboard.</p>
    `,
  });
};

module.exports = {
  sendEmail,
  notifyAdminOfRequest,
  notifyCompanyOfApproval,
  notifyCompanyOfRejection,
  notifyAdminOfRmRequest,
};
