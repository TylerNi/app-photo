import { useNavigate } from 'react-router-dom';
import { useSession } from '../session';

export function ProfilePick() {
  const { profiles, chooseProfile } = useSession();
  const navigate = useNavigate();

  async function pick(name: string) {
    await chooseProfile(name);
    navigate('/');
  }

  return (
    <div className="profile-pick">
      {profiles.map((name, index) => (
        <button
          key={name}
          className={`profile-tile profile-${index}`}
          type="button"
          onClick={() => pick(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
