"use client";

import { useState } from "react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: ""});
  const [status, setStatus] = useState("");

  const handleSubmit = async () => {
    setStatus("Sending...");

    const res = await fetch("/api/contact", {
      method: "POST",
      body: JSON.stringify(form),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      setStatus("Message sent!");
      setForm({ name: "", email: "", message: "" });
    } else {
      setStatus("Failed to send.");
    }
  };

  return (
    <div className="flex flex-col items-center gap-12 pt-20">
      <div className="flex flex-col items-center gap-2 w-full px-4">
        <h1 className="text-3xl font-bold">[contact]</h1>
        <div className="w-full max-w-xl flex flex-col gap-4 mt-2">
          <input
            type="text"
            placeholder="Your Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-gray-300 p-2 rounded"
          />
          <input
            type="email"
            placeholder="Your Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border border-gray-300 p-2 rounded"
          />
          <textarea
            placeholder="Your Message"
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="border border-gray-300 p-2 rounded"
          />
          <button className="self-end px-4 py-2 bg-black text-white font-bold rounded hover:bg-gray-800 transition" onClick={handleSubmit}>
            send
          </button>
        </div>
      </div>
    </div>
  );
}