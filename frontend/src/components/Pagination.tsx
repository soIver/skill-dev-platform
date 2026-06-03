interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPreloadNext?: () => void;
  className?: string;
}

interface PaginationArrowProps {
  direction: "left" | "right";
  onClick: () => void;
  disabled: boolean;
  onMouseEnter?: () => void;
}

function PaginationArrow({ direction, onClick, disabled, onMouseEnter }: PaginationArrowProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      disabled={disabled}
      className="px-2 py-1 text-lg rounded-full cursor-pointer hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
    >
      {direction === "left" ? "←" : "→"}
    </button>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  onPreloadNext,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex justify-center items-center gap-2 ${className}`}>
      <PaginationArrow
        direction="left"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      />
      <span className="text-sm text-gray-600">
        Страница {currentPage} из {totalPages}
      </span>
      <PaginationArrow
        direction="right"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        onMouseEnter={onPreloadNext}
      />
    </div>
  );
}