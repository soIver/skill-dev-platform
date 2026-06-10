import { useRef } from "react";

import { authJson } from "../auth";
import { useUserStore } from "../hooks/useUserStore";
import { AutocompleteSearch } from "./AutocompleteSearch";

interface ContentOwnerItem {
  id: number;
  username: string;
}

interface ContentOwnerFilterProps {
  entityLabel: string;
  ownerId: number | null;
  ownerUsername: string;
  onOwnerIdChange: (ownerId: number | null) => void;
  onOwnerUsernameChange: (username: string) => void;
}

export function ContentOwnerFilter({
  entityLabel,
  ownerId,
  ownerUsername,
  onOwnerIdChange,
  onOwnerUsernameChange,
}: ContentOwnerFilterProps) {
  const user = useUserStore((state) => state.user);
  const selectedOwnerRef = useRef<ContentOwnerItem | null>(null);

  if (!user) {
    return null;
  }

  if (user.role === "curator") {
    return (
      <label className="flex my-auto items-center gap-3 cursor-pointer text-md text-gray-700 shrink-0">
        <input
          type="checkbox"
          checked={ownerId === user.id}
          onChange={(event) => {
            onOwnerIdChange(event.target.checked ? user.id : null);
            onOwnerUsernameChange("");
          }}
          className="checkbox-field"
          style={{ transform: 'scale(1.2)'}}
        />
        <span>{`Только мои ${entityLabel}`}</span>
      </label>
    );
  }

  if (user.role !== "admin") {
    return null;
  }

  const searchOwners = async (query: string) => {
    const params = new URLSearchParams();
    params.append("q", query);
    const response = await authJson<{ items: ContentOwnerItem[] }>(`/auth/owners?${params.toString()}`);
    return response.items;
  };

  return (
    <div className="w-full max-w-3xs shrink-0">
      <AutocompleteSearch<ContentOwnerItem>
        onSearch={searchOwners}
        onSelect={() => undefined}
        onInputChange={(value) => {
          onOwnerUsernameChange(value);
          if (!value) {
            selectedOwnerRef.current = null;
            onOwnerIdChange(null);
            return;
          }

          if (selectedOwnerRef.current?.username === value) {
            return;
          }

          if (value !== ownerUsername) {
            selectedOwnerRef.current = null;
            onOwnerIdChange(null);
          }
        }}
        onSelectedItemChange={(item) => {
          if (!item) {
            return;
          }
          selectedOwnerRef.current = item;
          onOwnerIdChange(item.id);
        }}
        itemToString={(item) => item.username}
        renderItem={(item) => <span>{item.username}</span>}
        placeholder="Поиск по создателю"
        hideButton={true}
        value={ownerUsername}
        showClearButton={true}
        className="w-full"
      />
    </div>
  );
}
