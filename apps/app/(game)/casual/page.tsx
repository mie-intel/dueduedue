import { Suspense } from "react";
import Spinner from "../../../components/ui/Spinner";
import CasualClient from "./CasualClient";

export default function CasualPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    import React, { Suspense } from 'react';
    import CasualClient from './CasualClient';

    export default function CasualPage() {
      return (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div>Loading...</div></div>}>
          <CasualClient />
        </Suspense>
      );
    }
