import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";

export interface ActionMenuItem {
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  title?: string;
}

export function ActionMenu({ items, title = "Доступные действия" }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    // Захватываем события на фазе capture, чтобы избежать закрытия при клике на удаляемый элемент
    document.addEventListener("click", handleClickOutside, true);
    return () => document.removeEventListener("click", handleClickOutside, true);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        title={title}
      >
        <Menu className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {items.map((item, index) => {
              if (item.disabled) {
                 return (
                    <span
                      key={index}
                      className="block px-4 py-2 text-sm text-gray-400 text-left cursor-not-allowed whitespace-normal break-words leading-snug"
                      role="menuitem"
                    >
                      {item.label}
                    </span>
                 );
              }
              
              if (item.to) {
                return (
                  <Link
                    key={index}
                    to={item.to}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left whitespace-normal break-words leading-snug"
                    role="menuitem"
                  >
                    {item.label}
                  </Link>
                );
              }
              
              return (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    item.onClick?.();
                  }}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left whitespace-normal break-words leading-snug"
                  role="menuitem"
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
