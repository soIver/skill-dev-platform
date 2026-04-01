export default function Skills() {
  return (
    <div className="flex gap-8">
      {/* Ваши навыки */}
      <div className="workspace-panel flex-1">
        <h2 className="workspace-panel-header">Ваши навыки</h2>
        <p className="text-gray-500">Здесь будут отображаться ваши навыки...</p>
      </div>

      {/* Рекомендации */}
      <div className="workspace-panel flex-1">
        <h2 className="workspace-panel-header">Рекомендации</h2>
        <p className="text-gray-500">Здесь будут рекомендации по навыкам...</p>
      </div>
    </div>
  );
}
