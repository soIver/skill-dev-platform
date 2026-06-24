import ActivityHistory from "./progress/ActivityHistory";
import Recomendations from "./progress/Recomendations";

export default function Progress() {
  return (
    <div className="workspace-container-no-nav m-7">
      <ActivityHistory />
      <Recomendations />
    </div>
  );
}
