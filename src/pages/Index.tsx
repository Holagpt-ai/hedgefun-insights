import Disclaimer from "@/components/layout/Disclaimer";

const Index = () => {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-display tracking-tight text-foreground">HedgeFun</h1>
        <p className="mt-2 text-lg text-text-secondary">Your Edge In Every Market</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Layout shell loaded. Homepage content coming in Part 4.
        </p>
        <div className="mt-8">
          <Disclaimer />
        </div>
      </div>
    </div>
  );
};

export default Index;
