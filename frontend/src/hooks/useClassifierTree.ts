import { useEffect, useRef } from "react";
import { authJson } from "../auth";
import {
  useContentStore,
  type ClassifierProfStandardTreeItem,
} from "./useContentStore";

interface ClassifierTreeResponse {
  items: ClassifierProfStandardTreeItem[];
}

export function useClassifierTree() {
  const { classifier, setClassifierState } = useContentStore();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (classifier.hasLoaded || hasRequestedRef.current) return;
    hasRequestedRef.current = true;

    const fetchTree = async () => {
      try {
        const response = await authJson<ClassifierTreeResponse>("/classifier/tree");
        setClassifierState({
          results: response.items,
          lastSearch: { query: "" },
          hasLoaded: true,
        });
      } catch (error) {
        console.error("Failed to load classifier tree", error);
      }
    };

    void fetchTree();
  }, [classifier.hasLoaded, setClassifierState]);

  return {
    items: classifier.results,
    isLoading: !classifier.hasLoaded,
  };
}
