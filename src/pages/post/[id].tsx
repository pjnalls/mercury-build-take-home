import NextError from 'next/error';
import Link from 'next/link';
import { useRouter } from 'next/router';

import type { NextPageWithLayout } from '~/pages/_app';
import type { RouterOutput } from '~/utils/trpc';
import { trpc } from '~/utils/trpc';

type WorkflowTemplateByIdOutput = RouterOutput['workflow']['queryWorkflowTemplateDetails'];

function WorkflowTemplateItem(props: { workflowTemplate: WorkflowTemplateByIdOutput }) {
  const { workflowTemplate } = props;
  return (
    <div className="flex flex-col justify-center h-full px-8 ">
      <Link className="text-gray-300 underline mb-4" href="/">
        Home
      </Link>
      <h1 className="text-4xl font-bold">{workflowTemplate?.name}</h1>
      <em className="text-gray-400">
        Created {workflowTemplate?.createdAt.toLocaleDateString('en-us')}
      </em>

      <p className="py-4 break-all">{workflowTemplate?.description}</p>

      <h2 className="text-2xl font-semibold py-2">Raw data:</h2>
      <pre className="bg-gray-900 p-4 rounded-xl overflow-x-scroll">
        {JSON.stringify(workflowTemplate, null, 4)}
      </pre>
    </div>
  );
}

const WorkflowTemplateViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const postQuery = trpc.workflow.queryWorkflowTemplateDetails.useQuery({ workflowId: Number(id) });

  if (postQuery.error) {
    return (
      <NextError
        title={postQuery.error.message}
        statusCode={postQuery.error.data?.httpStatus ?? 500}
      />
    );
  }

  if (postQuery.status !== 'success') {
    return (
      <div className="flex flex-col justify-center h-full px-8 ">
        <div className="w-full bg-zinc-900/70 rounded-md h-10 animate-pulse mb-2"></div>
        <div className="w-2/6 bg-zinc-900/70 rounded-md h-5 animate-pulse mb-8"></div>

        <div className="w-full bg-zinc-900/70 rounded-md h-40 animate-pulse"></div>
      </div>
    );
  }
  const { data } = postQuery;
  return <WorkflowTemplateItem workflowTemplate={data} />;
};

export default WorkflowTemplateViewPage;
