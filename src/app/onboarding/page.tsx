import { OrganizationList } from '@clerk/nextjs';

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo(a)!</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Crie a sua empresa ou selecione uma existente para continuar.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
      />
    </div>
  );
}
