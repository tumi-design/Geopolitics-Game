export default function Flag({ code, large = false }) {
  return <img className={`flag${large ? ' flag-large' : ''}`}
    src={`${import.meta.env.BASE_URL}flags/${code.toLowerCase()}.svg`}
    alt="" width={large ? 60 : 28} height={large ? 40 : 20} />;
}
