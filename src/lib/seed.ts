import { db } from "@/db";
import {
  projects,
  scripts,
  scenes,
  canvasNodes,
  chatMessages,
} from "@/db/schema";
import { createId, nowIso } from "@/lib/id";
import { parseScreenplayText } from "@/lib/screenplay";

const DEMO_SCENE = `INT. KITCHEN - NIGHT

A small apartment kitchen. Rain against the window. MARA (30s) stands at the sink, washing the same plate for too long. JULES (30s) enters, still in a coat, dripping.

JULES
You didn't answer.

MARA
I was washing up.

JULES
At midnight.

Beat. Mara sets the plate down carefully — too carefully.

MARA
How was it?

JULES
Don't do that.

MARA
Do what?

JULES
Ask like you care about the answer.

Mara turns. Something sharp and tired in her face.

MARA
Fine. How was fucking her?

Silence. Jules takes off the coat. Doesn't hang it up. Lets it drop.

JULES
It wasn't about that.

MARA
It never is, with you.

JULES
You want me to say I'm sorry.

MARA
I want you to mean it.

Jules steps closer. Mara doesn't move.

JULES
I'm sorry.

MARA
(soft)
Then leave.

Jules stops. The rain fills the room.

JULES
You don't mean that.

MARA
Try me.
`;

let seeded = false;

function insertDemoProject(userId: string | null) {
  const now = nowIso();
  const projectId = createId("proj");
  const scriptId = createId("script");
  const sceneId = createId("scene");

  db.insert(projects)
    .values({
      id: projectId,
      userId,
      title: "Demo — Kitchen Midnight",
      createdAt: now,
    })
    .run();

  db.insert(scripts)
    .values({
      id: scriptId,
      projectId,
      title: "Demo — Kitchen Midnight",
      orderIndex: 0,
      episodeNumber: 1,
      sourceType: "typed",
      createdAt: now,
    })
    .run();

  const parsedMeta = parseScreenplayText(DEMO_SCENE);
  db.insert(scenes)
    .values({
      id: sceneId,
      projectId,
      scriptId,
      heading: "INT. KITCHEN - NIGHT",
      orderIndex: 0,
      rawText: DEMO_SCENE,
      sourceType: "typed",
      parsedMeta: JSON.stringify(parsedMeta),
      createdAt: now,
    })
    .run();

  const nodes = [
    {
      id: createId("node"),
      projectId,
      type: "mood",
      content: JSON.stringify({
        mood: "Brittle intimacy — love as a weapon",
        color: "#7c3aed",
      }),
      positionX: 80,
      positionY: 120,
      label: "Overall temperature",
      createdAt: now,
    },
    {
      id: createId("node"),
      projectId,
      type: "text",
      content: JSON.stringify({
        text: "Mara washing the plate = control ritual. Don't let her play victim. She's the one with the knife, even if it's emotional.",
      }),
      positionX: 360,
      positionY: 80,
      label: "Mara instinct",
      createdAt: now,
    },
    {
      id: createId("node"),
      projectId,
      type: "text",
      content: JSON.stringify({
        text: "Jules should arrive already defeated — not swaggering. The coat drop is a surrender, not a power move.",
      }),
      positionX: 360,
      positionY: 280,
      label: "Jules instinct",
      createdAt: now,
    },
    {
      id: createId("node"),
      projectId,
      type: "video-link",
      content: JSON.stringify({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
      positionX: 80,
      positionY: 320,
      label: "Reference energy (placeholder) — quiet confrontation",
      createdAt: now,
    },
  ];

  for (const n of nodes) {
    db.insert(canvasNodes).values(n).run();
  }

  db.insert(chatMessages)
    .values({
      id: createId("msg"),
      projectId,
      role: "assistant",
      content:
        "Welcome. I've loaded a demo scene — a midnight kitchen confrontation between Mara and Jules. Drop references on the instinct canvas for each scene, then use Shoot schedule and Export to build day packs for set.",
      createdAt: now,
    })
    .run();
}

/** Legacy: seed one global demo when DB is empty and auth is off. */
export function seedDemoIfEmpty() {
  if (seeded) return;
  seeded = true;

  const existing = db.select().from(projects).all();
  if (existing.length > 0) return;

  insertDemoProject(null);
}

/** Phase 2: seed a personal demo project for a new user. */
export function seedDemoForUser(userId: string) {
  insertDemoProject(userId);
}
