export default function GreetingCard() {
  const textWidthPercent = 65;
  return (
    <div>
      
      <div className="mt-8 w-fit border-2 border-black p-4 mx-auto">
        <div className="flex flex-row gap-4">
          <div className="flex flex-col gap-2" style={{ width: `${textWidthPercent}%` }}>
            <h1 className="text-3xl font-bold w-fit">hi, i'm [armand]</h1>
            <p className="font-semibold break-words w-full max-w-full text-justify">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            </p>
          </div>
          <div className="flex flex-col gap-2" style={{ width: `${100 - textWidthPercent}%` }}>
            <img
              className="w-full h-auto"
              src="https://czxrgkpzsfztyahycugs.supabase.co/storage/v1/object/public/random-images//dither-cat.png"
              alt="Dithered Cat"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
