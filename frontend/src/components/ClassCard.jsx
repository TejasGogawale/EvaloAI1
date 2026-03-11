import { FaEllipsisV } from "react-icons/fa";

export default function ClassCard({ cls, onOpen = () => {}, onMenu = () => {} }) {
  // We expect `cls` to have { id, name, teacherName? }
  const teacher = cls.teacherName || cls.owner_name || cls.teacher_name;

  return (
    <div className="gc-card" role="button" onClick={() => onOpen(cls.id)}>
      <div className="gc-card-header">
        <div className="gc-card-title">
          <h3 className="gc-ellipsis">{cls.name}</h3>
          <div className="gc-sub">— {teacher}</div>
        </div>
        <button
          className="gc-kebab"
          aria-label="More options"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(cls.id);
          }}
        >
          <FaEllipsisV />
        </button>
      </div>

      <div className="gc-card-body">
        {/* reserved for quick actions (icons) later */}
      </div>
    </div>
  );
}
