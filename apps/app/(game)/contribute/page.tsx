import Link from "next/link";
import Card from "../../../components/ui/Card";
import { CameraIcon } from "../../../components/icons";

const steps = [
  {
    num: "01",
    title: "Submit Image",
    desc: "Upload a clear photo of any real-world object, landmark, food, or animal.",
  },
  {
    num: "02",
    title: "AI Verification",
    desc: "AI reviews your submission for quality and appropriate difficulty. Approved in minutes.",
  },
  {
    num: "03",
    title: "Earn Royalties",
    desc: "Every time your image is used in a paid game, you earn a share of the pool. Forever.",
  },
];

export default function ContributePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-bg-page pb-24">
      {/* Header */}
      <div className="bg-bg-card px-5 pt-8 pb-6 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-light flex items-center justify-center shrink-0">
            <CameraIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-text-primary leading-tight">
              Contribute Questions
            </h1>
            <p className="text-text-secondary text-sm font-sans mt-0.5">
              Submit images · AI verified · Earn royalties forever
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 max-w-lg mx-auto w-full flex flex-col gap-5">
        {/* Earnings callout */}
        <div className="bg-secondary/20 border border-secondary/40 rounded-2xl p-4">
          <p className="font-display font-bold text-text-primary text-base">
            Earn passive royalties
          </p>
          <p className="text-text-secondary text-sm font-sans mt-1">
            Contributors receive a share of every paid game session that uses
            their image — no limit, no expiry.
          </p>
        </div>

        {/* How it works */}
        <div>
          <h2 className="font-display font-bold text-lg text-text-primary mb-3">
            How it works
          </h2>
          <div className="flex flex-col gap-3">
            {steps.map((step) => (
              <Card key={step.num} className="flex items-start gap-4">
                <span className="font-display font-bold text-2xl text-primary/70 w-10 shrink-0">
                  {step.num}
                </span>
                <div>
                  <p className="font-sans font-semibold text-text-primary text-sm">
                    {step.title}
                  </p>
                  <p className="font-sans text-text-secondary text-sm mt-0.5">
                    {step.desc}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/contribute/submit"
          className="block w-full py-4 rounded-2xl bg-primary text-text-inverse text-center font-sans font-semibold text-base active:opacity-80 transition-opacity"
        >
          Submit an Image
        </Link>

        <p className="text-text-secondary text-xs font-sans text-center -mt-1">
          Requires wallet connection · AI verification takes ~2 min
        </p>
      </div>
    </div>
  );
}
