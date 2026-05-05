interface Requirement {
  text: string;
  met: boolean;
}

interface FieldRequirementsProps {
  requirements: Requirement[];
  visible: boolean;
}

export default function FieldRequirements({ requirements, visible }: FieldRequirementsProps) {
  return (
    <div
      className="field-requirements-wrapper"
      style={{ gridTemplateRows: visible ? "1fr" : "0fr" }}
    >
      <div className="field-requirements-inner">
        <ul className="field-requirements-list">
          {requirements.map((req, i) => (
            <li key={i} className={req.met ? "req-met" : "req-unmet"}>
              <span className="req-icon">{req.met ? "✓" : "✗"}</span>
              {req.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
