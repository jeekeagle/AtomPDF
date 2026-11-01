import type { PdfNodeTone, PdfTreeNode } from '../types';

export const MAX_TREE_LEVEL = 4;

interface SeedSpec {
  id: string;
  title: string;
  note?: string;
  tone: PdfNodeTone;
  children?: SeedSpec[];
}

/*
 * 四条主线：
 * 人怎么学（认知）、Agent 怎么运转（知识 / 技术）、
 * 事情怎么落地（实践）、课怎么交付（培训）。
 */
const seedTree: SeedSpec[] = [
  {
    id: 'pdf-root-ai',
    title: 'AI',
    note: '领域根节点',
    tone: 'ink',
    children: [
      {
        id: 'pdf-node-cognition',
        title: '认知与学习',
        note: '人如何理解、学习与使用 AI',
        tone: 'brick',
        children: [
          {
            id: 'pdf-node-learning-science',
            title: '学习科学',
            tone: 'brick',
            children: [
              { id: 'pdf-node-cognitive-load', title: '认知负荷', tone: 'brick' },
              { id: 'pdf-node-deliberate-practice', title: '刻意练习', tone: 'brick' }
            ]
          },
          {
            id: 'pdf-node-ai-literacy',
            title: 'AI 素养',
            tone: 'brick',
            children: [
              { id: 'pdf-node-capability-boundary', title: '能力边界', tone: 'brick' },
              { id: 'pdf-node-human-ai-collaboration', title: '人机协作', tone: 'brick' }
            ]
          }
        ]
      },
      {
        id: 'pdf-node-knowledge',
        title: '知识与原理',
        note: '模型与 Agent 的底层知识',
        tone: 'teal',
        children: [
          {
            id: 'pdf-node-model-foundations',
            title: '模型基础',
            tone: 'teal',
            children: [
              { id: 'pdf-node-language-models', title: '语言模型', tone: 'teal' },
              { id: 'pdf-node-reasoning-multimodal', title: '推理与多模态', tone: 'teal' }
            ]
          },
          {
            id: 'pdf-node-agent-architecture',
            title: 'Agent 架构',
            tone: 'teal',
            children: [
              { id: 'pdf-node-planning-memory', title: '规划与记忆', tone: 'teal' },
              { id: 'pdf-node-tool-calling', title: '工具调用', tone: 'teal' }
            ]
          },
          {
            id: 'pdf-node-context-engineering',
            title: '上下文工程',
            tone: 'teal',
            children: [
              { id: 'pdf-node-prompting', title: '提示词', tone: 'teal' },
              { id: 'pdf-node-retrieval-augmented', title: '检索增强', tone: 'teal' }
            ]
          }
        ]
      },
      {
        id: 'pdf-node-technology',
        title: '技术与工具',
        note: '把 Agent 跑起来的工程能力',
        tone: 'gold',
        children: [
          {
            id: 'pdf-node-tools-protocols',
            title: '工具与协议',
            tone: 'gold',
            children: [
              { id: 'pdf-node-mcp-protocol', title: 'MCP 协议', tone: 'gold' },
              { id: 'pdf-node-function-calling', title: '函数调用', tone: 'gold' }
            ]
          },
          {
            id: 'pdf-node-workflow-orchestration',
            title: '工作流编排',
            tone: 'gold',
            children: [
              { id: 'pdf-node-single-agent-flow', title: '单 Agent 流程', tone: 'gold' },
              { id: 'pdf-node-multi-agent', title: '多 Agent 协作', tone: 'gold' }
            ]
          },
          {
            id: 'pdf-node-quality-security',
            title: '质量与安全',
            tone: 'gold',
            children: [
              { id: 'pdf-node-evaluation', title: '评测方法', tone: 'gold' },
              { id: 'pdf-node-permission-compliance', title: '权限与合规', tone: 'gold' }
            ]
          }
        ]
      },
      {
        id: 'pdf-node-practice',
        title: '实践与案例',
        note: '真实场景里的用法与案例',
        tone: 'ink',
        children: [
          {
            id: 'pdf-node-personal-workflow',
            title: '个人工作流',
            tone: 'ink',
            children: [
              { id: 'pdf-node-content-production', title: '内容生产', tone: 'ink' },
              { id: 'pdf-node-research-coding', title: '研究与编程', tone: 'ink' }
            ]
          },
          {
            id: 'pdf-node-team-adoption',
            title: '团队落地',
            tone: 'ink',
            children: [
              { id: 'pdf-node-enterprise-knowledge', title: '企业知识库', tone: 'ink' },
              { id: 'pdf-node-business-process', title: '业务流程', tone: 'ink' }
            ]
          },
          {
            id: 'pdf-node-industry-scenes',
            title: '行业场景',
            tone: 'ink',
            children: [
              { id: 'pdf-node-education', title: '教育场景', tone: 'ink' },
              { id: 'pdf-node-healthcare-finance', title: '医疗与金融', tone: 'ink' }
            ]
          }
        ]
      },
      {
        id: 'pdf-node-training',
        title: '培训与交付',
        note: '把知识变成课程、课件与练习',
        tone: 'teal',
        children: [
          {
            id: 'pdf-node-course-design',
            title: '课程设计',
            tone: 'teal',
            children: [
              { id: 'pdf-node-objectives-outline', title: '目标与大纲', tone: 'teal' },
              { id: 'pdf-node-tasks-rhythm', title: '任务与节奏', tone: 'teal' }
            ]
          },
          {
            id: 'pdf-node-courseware-script',
            title: '课件与讲稿',
            tone: 'teal',
            children: [
              { id: 'pdf-node-handout', title: '讲义', tone: 'teal' },
              { id: 'pdf-node-demo-case', title: '演示与案例', tone: 'teal' }
            ]
          },
          {
            id: 'pdf-node-practice-assessment',
            title: '练习与评估',
            tone: 'teal',
            children: [
              { id: 'pdf-node-exercises-quiz', title: '作业与测验', tone: 'teal' },
              { id: 'pdf-node-feedback-iteration', title: '反馈与迭代', tone: 'teal' }
            ]
          }
        ]
      }
    ]
  }
];

export const seedNodes = (createdAt = new Date().toISOString()): PdfTreeNode[] => {
  const nodes: PdfTreeNode[] = [];
  const visit = (spec: SeedSpec, parentId: string | null, order: number, level: number) => {
    if (level > MAX_TREE_LEVEL) return;
    nodes.push({
      id: spec.id,
      parentId,
      title: spec.title,
      note: spec.note ?? '',
      tone: spec.tone,
      order,
      pages: [],
      createdAt,
      updatedAt: createdAt
    });
    (spec.children ?? []).forEach((child, index) =>
      visit(child, spec.id, index, level + 1)
    );
  };
  seedTree.forEach((spec, index) => visit(spec, null, index, 1));
  return nodes;
};

const legacyTitles: Record<string, string> = {
  'pdf-root-ai': 'AI',
  'pdf-node-cognition': '认知',
  'pdf-node-knowledge': '知识',
  'pdf-node-technology': '技术',
  'pdf-node-practice': '实践',
  'pdf-node-industry': '行业'
};

export const isLegacySeedTree = (nodes: PdfTreeNode[]) => {
  const ids = Object.keys(legacyTitles);
  if (nodes.length !== ids.length) return false;
  return nodes.every((node) => legacyTitles[node.id] === node.title);
};

/*
 * 旧版默认树只有「认知 / 知识 / 技术 / 实践 / 行业」六个节点。
 * 升级时把各节点里已经归好的页面带到新树对应位置，避免用户重排。
 */
export const migrateLegacyTree = (nodes: PdfTreeNode[], createdAt = new Date().toISOString()) => {
  const legacyById = new Map(nodes.map((node) => [node.id, node]));
  const remap: Record<string, string> = {
    'pdf-node-industry': 'pdf-node-industry-scenes'
  };
  const sourceIdByTarget = new Map(
    Object.entries(remap).map(([source, target]) => [target, source])
  );
  return seedNodes(createdAt).map((node) => {
    const source = legacyById.get(sourceIdByTarget.get(node.id) ?? node.id);
    if (!source) return node;
    return {
      ...node,
      pages: [...source.pages],
      note: source.note.trim() || node.note,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt
    };
  });
};

export const nodeLevel = (nodes: PdfTreeNode[], nodeId: string) => {
  let level = 1;
  let cursor = nodes.find((node) => node.id === nodeId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    cursor = nodes.find((node) => node.id === cursor?.parentId);
    if (cursor) level += 1;
  }
  return level;
};

export const subtreeHeight = (
  nodes: PdfTreeNode[],
  nodeId: string,
  seen = new Set<string>()
): number => {
  if (seen.has(nodeId)) return 1;
  seen.add(nodeId);
  const children = nodes.filter((node) => node.parentId === nodeId);
  if (!children.length) return 1;
  return 1 + Math.max(...children.map((child) => subtreeHeight(nodes, child.id, seen)));
};

export const fitsUnderParent = (
  nodes: PdfTreeNode[],
  nodeId: string | null,
  parentId: string | null
) => {
  if (!parentId) return true;
  const parentLevel = nodeLevel(nodes, parentId);
  const height = nodeId ? subtreeHeight(nodes, nodeId) : 1;
  return parentLevel + height <= MAX_TREE_LEVEL;
};
