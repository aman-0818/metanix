from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_add_location_to_signinlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='has_presentation_creator',
            field=models.BooleanField(
                default=False,
                help_text='Grant access to the AI presentation creation studio',
                verbose_name='Presentation Creator Access',
            ),
        ),
    ]
