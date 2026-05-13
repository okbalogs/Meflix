export default function Toast({ message }: { message: string }) {
  return <div className="toast-notification">{message}</div>;
}
