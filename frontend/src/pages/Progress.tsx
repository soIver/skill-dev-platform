import ActivityHistory from "./progress/ActivityHistory";
import Recomendations from "./progress/Recomendations";

export default function Progress() {
  return (
    <div className="workspace-container m-7">
      <ActivityHistory />
      <Recomendations />
    </div>
  );
}
