

import GreetingCard from "../components/greetingCard";

export default function ContactPage() {
  return (
    <div className="flex flex-col items-center gap-12 pt-20">
      <div className="flex flex-col items-center gap-2 w-full px-4">
        <h1 className="text-3xl font-bold">[contact]</h1>
        <div className="w-full max-w-xl flex flex-col gap-4 mt-2">
          <input
            type="text"
            placeholder="Your Name"
            className="border border-gray-300 p-2 rounded"
          />
          <input
            type="email"
            placeholder="Your Email"
            className="border border-gray-300 p-2 rounded"
          />
          <textarea
            placeholder="Your Message"
            rows={5}
            className="border border-gray-300 p-2 rounded"
          />
          <button className="self-end px-4 py-2 bg-black text-white font-bold rounded hover:bg-gray-800 transition">
            send
          </button>
        </div>
      </div>
    </div>
  );
}