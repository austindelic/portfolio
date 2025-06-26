import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
	const {name, email, message} = await req.json();

	const transporter = nodemailer.createTransport({
		service: "gmail",
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS
		}
	});

	try {
		await transporter.sendMail({
				from: email,
				to: process.env.EMAIL_USER,
				subject: `Contact Form Submission from ${name}`,
				text:`from: ${email}:\n ${message}`,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error sending email:", error);
		return NextResponse.json({ success: false }, { status: 500 });
	}
}