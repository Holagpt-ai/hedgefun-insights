import Disclaimer from '@/components/layout/Disclaimer';

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-display tracking-tight text-foreground">
          HedgeFun
        </h1>
        <p className="mt-2 text-lg text-text-secondary">
          Your Edge In Every Market
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Foundation loaded. UI coming in Part 2.
        </p>
        <div className="mt-8">
          <Disclaimer />
        </div>
      </div>
    </div>
  );
};

export default Index;
