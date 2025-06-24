"use client";
import { fetch_example } from "@/lib";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const get_data = async () => {
      const data = await fetch_example()
      console.log("Data fetched successfully", data);
    }
    // This is where you can initialize any client-side libraries or perform side effects
    get_data();
  });
  return 
    <div className="text-center pt-20">    
      <h1 className="text-3xl font-bold">Welcome to My Blog</h1>
      <p>My projects</p>
      

    </div>;
}
