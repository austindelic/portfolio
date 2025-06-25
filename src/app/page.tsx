export default function Home() {
  return (
    <div className="pt-20">
      
      <div className="mt-8 w-fit border-2 border-black p-4 w-fit mx-auto">
        <div className="flex flex-row gap-4">
          <div className="flex flex-col gap-2 w-fit">
            <h1 className="text-3xl font-bold w-fit">hi, i'm [armand]</h1>
            <p className="font-semibold break-words w-full max-w-full">
              I'm Armand, a creative technophile who builds games, robots, and anything else that lets me tinker. I love crafting weird interfaces, obsessing over clean code, and making things that feel alive. You'll usually find me deep in a dev session, sketching out ideas in Figma, or figuring out how to bend code to my will. I like tech that feels like magic and projects that punch above their weight.
            </p>
          </div>
          <div className="flex flex-col gap-2 w-fit">
            <img
              className="w-fit h-auto"
              src="https://czxrgkpzsfztyahycugs.supabase.co/storage/v1/object/public/random-images//dither-cat.png"
              alt="Dithered Cat"
            />
          </div>
        </div>
      </div>
    </div>
  );
}