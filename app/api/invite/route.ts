import { NextRequest, NextResponse } from 'next/server';
import { Client, Users, Databases, ID, Query } from 'node-appwrite';
import nodemailer from 'nodemailer';

// Initialize Appwrite Admin SDK
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const users = new Users(client);
const databases = new Databases(client);

// Initialize Nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export async function POST(req: NextRequest) {
    try {
        const { email, name, meetingLink, roomName, inviterName, contactId } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // 1. Lookup user in Appwrite to check if they are a DVAI member
        let dvaiMember: any = null;
        try {
            const userList = await users.list([Query.equal('email', email)]);
            if (userList.total > 0) {
                dvaiMember = userList.users[0];
            }
        } catch (error) {
            console.error('Appwrite user lookup failed:', error);
        }

        // 2. Enrich contact details
        const contactData: any = {
            name: name || dvaiMember?.name || email.split('@')[0],
            email,
            dvai_id: dvaiMember?.$id || '',
            avatarUrl: dvaiMember?.prefs?.avatarUrl || '',
            phone: dvaiMember?.phone || '',
            userid: req.headers.get('x-user-id') || '',
        };

        if (!contactData.userid) {
            console.warn(
                'No x-user-id provided in headers. Contact might not be correctly associated.',
            );
        }

        // 3. Save/Update contact in Appwrite
        try {
            const databaseId = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
            const collectionId = 'contacts';

            // Check if contact already exists for this owner and email
            const existingContacts = await databases.listDocuments(databaseId, collectionId, [
                Query.equal('userid', contactData.userid),
                Query.equal('email', email),
            ]);

            if (existingContacts.total > 0) {
                // Update existing
                await databases.updateDocument(
                    databaseId,
                    collectionId,
                    existingContacts.documents[0].$id,
                    contactData,
                );
            } else {
                // Create new
                await databases.createDocument(databaseId, collectionId, ID.unique(), contactData);
            }
        } catch (error) {
            console.error('Appwrite database operation failed:', error);
            // We continue even if DB fails, as sending the email is the primary action
        }

        // 4. Send Email via SMTP
        const mailOptions = {
            from: process.env.SMTP_FROM,
            to: email,
            subject: `${inviterName} invited you to a DVAI Connect meeting`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
                    <h2 style="color: #0f172a;">You're invited to a meeting</h2>
                    <p style="color: #475569; font-size: 16px;">
                        <strong>${inviterName}</strong> has invited you to join a video meeting on <strong>DVAI Connect</strong>.
                    </p>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${meetingLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                            Join Meeting: ${roomName}
                        </a>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">
                        Or copy and paste this link into your browser:<br>
                        <span style="color: #3b82f6;">${meetingLink}</span>
                    </p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                    <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                        DVAI Connect - Secure Video Conferencing
                    </p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);

        return NextResponse.json({ success: true, dvaiMember: !!dvaiMember });
    } catch (error: any) {
        console.error('Invite API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send invite' },
            { status: 500 },
        );
    }
}
