import { useParams } from 'react-router-dom';

const StockDetail = () => {
  const { ticker } = useParams<{ ticker: string }>();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-display ticker-symbol">{ticker?.toUpperCase()}</h1>
      <p className="mt-2 text-text-secondary">Stock detail page — built in later parts.</p>
    </div>
  );
};

export default StockDetail;
