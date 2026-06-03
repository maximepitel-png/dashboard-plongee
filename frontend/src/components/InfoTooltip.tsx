import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;       // explanation text
  className?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, className = '' }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        className="text-gray-600 hover:text-ocean-400 transition-colors ml-1 align-middle"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        aria-label="Aide"
      >
        <Info size={12} />
      </button>
      {visible && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-navy-800 border border-navy-600 px-3 py-2 text-xs text-gray-300 shadow-xl pointer-events-none"
          style={{ lineHeight: '1.5' }}
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy-600" />
        </span>
      )}
    </span>
  );
};

export default InfoTooltip;
