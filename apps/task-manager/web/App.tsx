import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Action, Task, TaskEvent } from "../server/db.ts";

type LabelName = "time" | "date" | "location";
const LABELS: LabelName[] = ["time", "date", "location"];
const MAX_INPUT = 500;

const EXAMPLES = [
  "Dentist tomorrow at 4:30pm at Smile Clinic",
  "Buy groceries",
  "Call mom on Sunday",
];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

function showTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function showDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const show = { time: showTime, date: showDate, location: (value: string) => value };

function showMoney(usd: number): string {
  return usd === 0 ? "$0" : usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(4)}`;
}

function showStamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Chip({ name, value }: { name: LabelName; value?: string }) {
  if (value === undefined) return <span className="chip missing">no {name}</span>;
  return <span className={`chip ${name}`} title={name}>{show[name](value)}</span>;
}

function Chips({ task }: { task: Task }) {
  return (
    <div className="chips">
      {LABELS.map((name) => <Chip key={name} name={name} value={task.labels[name]} />)}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && ref.current.close()}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" onClick={() => ref.current?.close()} aria-label="Close">×</button>
      </header>
      {children}
    </dialog>
  );
}

function History({ taskRef }: { taskRef: string }) {
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<TaskEvent[]>(`/api/tasks/${taskRef}/history`).then(setEvents).catch((e) => setError(e.message));
  }, [taskRef]);

  if (error) return <p className="error">{error}</p>;
  if (!events) return <p className="muted">Loading…</p>;
  if (events.length === 0) return <p className="muted">No recorded actions for this task.</p>;

  return (
    <ol className="history">
      {events.map((event) => (
        <li key={`${event.actionId}-${event.change.op}`}>
          <div className="event-head">
            <span className={`op ${event.change.op}`}>{event.change.op}</span>
            <span className="muted small">{showStamp(event.createdAt)}</span>
          </div>
          <p className="quote">“{event.input}”</p>
          <p className="event-text">{event.change.description}</p>
          <dl className="facts">
            <dt>Intent</dt>
            <dd>
              {event.intent ? (
                <>
                  {event.intent.intents.map((intent) => <span key={intent} className="chip intent">{intent}</span>)}
                  <span className="muted small"> {event.intent.summary}</span>
                </>
              ) : (
                <span className="muted small">not recorded</span>
              )}
            </dd>
            <dt>Labels</dt>
            <dd>
              {event.change.op === "deleted" ? (
                <span className="muted small">none, task deleted</span>
              ) : event.change.labels ? (
                <div className="chips">
                  {LABELS.map((name) => <Chip key={name} name={name} value={event.change.labels?.[name] ?? undefined} />)}
                </div>
              ) : (
                <span className="muted small">not recorded</span>
              )}
              {event.change.labelError && <p className="error small">{event.change.labelError}</p>}
            </dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "history">("details");
  return (
    <Modal title={task.ref} onClose={onClose}>
      <div className="tabs" role="tablist">
        {(["details", "history"] as const).map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "on" : ""} onClick={() => setTab(name)}>
            {name === "details" ? "Details" : "History"}
          </button>
        ))}
      </div>
      {tab === "history" ? (
        <History taskRef={task.ref} />
      ) : (
        <>
          <p className="task-text">{task.description}</p>
          <p className="muted small">Summary (used to find this task): {task.summary}</p>
          <h3>Labels</h3>
          <dl className="labels">
            {LABELS.map((name) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd><Chip name={name} value={task.labels[name]} /></dd>
              </div>
            ))}
          </dl>
          <p className="muted small">
            Missing: {task.missingLabels.length ? task.missingLabels.join(", ") : "nothing, all labels found"}
          </p>
          <p className="muted small">Created {showStamp(task.createdAt)} · Last modified {showStamp(task.updatedAt)}</p>
        </>
      )}
    </Modal>
  );
}

function LogsModal({ action, onClose }: { action: Action | null; onClose: () => void }) {
  return (
    <Modal title="Last action" onClose={onClose}>
      {!action ? (
        <p className="muted">Nothing yet. Run something from the input box.</p>
      ) : (
        <>
          <p className="quote">“{action.input}”</p>
          {action.intent && (
            <p className="small">
              {action.intent.intents.map((intent) => <span key={intent} className="chip intent">{intent}</span>)}{" "}
              <span className="muted">{action.intent.summary}</span>
            </p>
          )}
          <div className="cost">
            <strong>{showMoney(action.costUsd)}</strong>
            <span>end to end</span>
          </div>
          <p className="muted small">
            {action.inputTokens.toLocaleString()} tokens in · {action.outputTokens.toLocaleString()} out · {(action.durationMs / 1000).toFixed(1)}s ·{" "}
            {action.calls.length} model {action.calls.length === 1 ? "call" : "calls"}
          </p>
          <table>
            <thead>
              <tr><th>Call</th><th>Model</th><th className="num">In</th><th className="num">Out</th><th className="num">Cost</th></tr>
            </thead>
            <tbody>
              {action.calls.map((call, index) => (
                <Fragment key={index}>
                  <tr className={call.note ? "flagged" : undefined}>
                    <td>{call.name}</td>
                    <td>{call.model}</td>
                    <td className="num">{call.inputTokens}</td>
                    <td className="num">{call.outputTokens}</td>
                    <td className="num">{call.priceKnown ? showMoney(call.costUsd) : "n/a"}</td>
                  </tr>
                  {call.note && <tr className="note"><td colSpan={5}>{call.note}</td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            {action.traceId ? <>Langfuse trace <code>{action.traceId}</code></> : "Langfuse is off: add its keys to .env to trace."}
          </p>
        </>
      )}
    </Modal>
  );
}

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ input: string; action: Action } | null>(null);
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    api<Task[]>("/api/tasks").then(setTasks).catch((e) => setError(e.message));
    api<Action | null>("/api/logs/last").then(setLastAction).catch(() => {});
  }, []);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ action: Action; tasks: Task[] }>("/api/act", {
        input: text,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setTasks(data.tasks);
      setResult({ input: text, action: data.action });
      setLastAction(data.action);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  const viewed = tasks.find((task) => task.id === viewing);

  return (
    <div className="app">
      <aside>
        <h1>Task List</h1>
        <ul>
          {tasks.length === 0 && <li className="empty">No tasks yet. Tell the box on the right what to add.</li>}
          {tasks.map((task) => (
            <li key={task.id}>
              <button className="card" onClick={() => setViewing(task.id)}>
                <span className="ref">{task.ref}</span>
                <span className="desc">{task.description}</span>
                <Chips task={task} />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main>
        <button className="logs-button" onClick={() => setLogsOpen(true)}>Logs</button>

        <form className="prompt" onSubmit={submit}>
          <label htmlFor="input">Tell us what you want to do?</label>
          <div className="box">
            <textarea
              id="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_INPUT}
              rows={3}
              placeholder="Add, change or delete a task…"
              autoFocus
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>{busy ? "Working…" : "Go"}</button>
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          {!result && !busy && (
            <div className="examples">
              {EXAMPLES.map((example) => (
                <button type="button" key={example} onClick={() => setInput(example)}>{example}</button>
              ))}
            </div>
          )}

          {result && !busy && (
            <section className="result">
              <p className="quote">“{result.input}”</p>
              <p>{result.action.reply}</p>
              {result.action.changes.length > 0 && (
                <ul>
                  {result.action.changes.map((change, index) => (
                    <li key={index}><span className={`op ${change.op}`}>{change.op}</span> {change.ref} {change.description}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </form>
      </main>

      {viewed && <TaskModal task={viewed} onClose={() => setViewing(null)} />}
      {logsOpen && <LogsModal action={lastAction} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
