import type { PortableDrill } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";

export function createFlappyBirdFixture(): {
  drill: PortableDrill;
  sampledFrames: PoseFrame[];
} {
  const drill = {
    drillId: "flappy-bird-bird",
    title: "Flappy Bird Bird",
    drillType: "rep",
    phases: [
      {
        phaseId: "stand",
        order: 1,
        name: "Stand Straight",
        poseSequence: [{
          joints: {
            leftShoulder: { x: 0.44, y: 0.33 },
            rightShoulder: { x: 0.56, y: 0.33 },
            leftElbow: { x: 0.4, y: 0.48 },
            rightElbow: { x: 0.6, y: 0.48 },
            leftWrist: { x: 0.38, y: 0.62 },
            rightWrist: { x: 0.62, y: 0.62 },
            leftHip: { x: 0.46, y: 0.68 },
            rightHip: { x: 0.54, y: 0.68 }
          }
        }]
      },
      {
        phaseId: "flap",
        order: 2,
        name: "Flap",
        analysis: {
          matchHints: {
            requiredJoints: ["leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist"],
            optionalJoints: ["leftHip", "rightHip"]
          }
        },
        poseSequence: [{
          joints: {
            leftShoulder: { x: 0.44, y: 0.33 },
            rightShoulder: { x: 0.56, y: 0.33 },
            leftElbow: { x: 0.36, y: 0.31 },
            rightElbow: { x: 0.64, y: 0.31 },
            leftWrist: { x: 0.34, y: 0.26 },
            rightWrist: { x: 0.66, y: 0.26 },
            leftHip: { x: 0.46, y: 0.68 },
            rightHip: { x: 0.54, y: 0.68 }
          }
        }]
      }
    ],
    analysis: {
      measurementType: "rep",
      orderedPhaseSequence: ["stand", "flap"],
      minimumRepDurationMs: 0,
      cooldownMs: 0,
      minimumHoldDurationMs: 0
    }
  } as unknown as PortableDrill;
  const stand = drill.phases[0].poseSequence[0].joints;
  const flap = drill.phases[1].poseSequence[0].joints;
  const sampledFrames: PoseFrame[] = [
    { timestampMs: 0, joints: withJointOffsets(stand, { leftWrist: { dx: 0.01, dy: -0.01 }, rightWrist: { dx: -0.01, dy: 0.015 } }) },
    { timestampMs: 100, joints: withJointOffsets(stand, { leftElbow: { dx: -0.008, dy: 0.012 }, rightElbow: { dx: 0.008, dy: 0.008 } }) },
    {
      timestampMs: 200,
      joints: withJointOffsets(flap, {
        leftWrist: { dx: 0.015, dy: 0.025 },
        rightWrist: { dx: -0.02, dy: 0.02 },
        leftElbow: { dx: 0.01, dy: 0.02 },
        rightElbow: { dx: -0.01, dy: 0.025 }
      })
    },
    {
      timestampMs: 300,
      joints: withJointOffsets(flap, {
        leftWrist: { dx: -0.012, dy: 0.01 },
        rightWrist: { dx: 0.012, dy: 0.015 },
        leftElbow: { dx: -0.01, dy: 0.02 },
        rightElbow: { dx: 0.01, dy: 0.02 }
      })
    },
    { timestampMs: 400, joints: withJointOffsets(stand, { leftWrist: { dy: -0.01 }, rightWrist: { dy: -0.01 } }) },
    { timestampMs: 500, joints: withJointOffsets(stand, { leftElbow: { dy: 0.01 }, rightElbow: { dy: 0.01 } }) }
  ];
  return { drill, sampledFrames };
}

function withJointOffsets(
  joints: Record<string, { x: number; y: number }>,
  offsets: Partial<Record<string, { dx?: number; dy?: number }>>
) {
  return Object.fromEntries(
    Object.entries(joints).map(([jointName, joint]) => {
      const offset = offsets[jointName];
      return [
        jointName,
        {
          x: joint.x + (offset?.dx ?? 0),
          y: joint.y + (offset?.dy ?? 0)
        }
      ];
    })
  );
}
