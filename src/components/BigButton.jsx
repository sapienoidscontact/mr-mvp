import { useState, useCallback } from 'react';

const COLOR_MAP = {
  green: 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white border-green-700 shadow-green-200 dark:shadow-green-900',
  red: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white border-red-700 shadow-red-200 dark:shadow-red-900',
  amber: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white border-amber-600 shadow-amber-200 dark:shadow-amber-900',
  blue: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-700 shadow-blue-200 dark:shadow-blue-900',
  gray: 'bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 border-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-600'
};

const CONFIRM_MAP = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
};

export default function BigButton({
  label,
  icon,
  onClick,
  color = 'green',
  disabled = false,
  loading = false,
  confirmRequired = false,
  className = ''
}) {
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const handleClick = useCallback(async () => {
    if (disabled || loading) return;
    if (confirmRequired && !awaitingConfirm) {
      setAwaitingConfirm(true);
      setTimeout(() => setAwaitingConfirm(false), 3000);
      return;
    }
    setAwaitingConfirm(false);
    await onClick();
  }, [disabled, loading, confirmRequired, awaitingConfirm, onClick]);

  const colorClasses = COLOR_MAP[color] || COLOR_MAP.green;
  const confirmClasses = CONFIRM_MAP[color] || CONFIRM_MAP.green;

  return (
    <button
      type="button"
      role="button"
      aria-label={label}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        relative w-full min-h-[72px] rounded-2xl border-2 font-bold text-lg
        flex flex-col items-center justify-center gap-1 px-4 py-3
        transition-all duration-150 shadow-md
        disabled:opacity-50 disabled:cursor-not-allowed
        select-none touch-manipulation
        ${awaitingConfirm ? confirmClasses : colorClasses}
        ${className}
      `}
    >
      {loading ? (
        <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        <>
          <span className="text-3xl leading-none">{icon}</span>
          <span className="text-base leading-tight text-center">
            {awaitingConfirm ? 'Tap again to confirm' : label}
          </span>
        </>
      )}
    </button>
  );
}
